#!/usr/bin/env node

/**
 * Checks that this plugin can start SimpleVlogEditor, and says what to do
 * about whatever it cannot.
 *
 *   node scripts/doctor.mjs                 everything, including a real MCP session
 *   node scripts/doctor.mjs --no-launch     files only, no MCP session
 *   node scripts/doctor.mjs --close-editor  close the editor window at the end
 *
 * The plugin only uses the SimpleVlogEditor installed by its Windows installer
 * in the default folder; see editor-discovery.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PLUGIN_ROOT, pluginClient, readManifest } from './plugin-info.mjs';
import { PACKAGED_HOST_MARKER, platformKey } from './runtime-location.mjs';
import { archiveHasFile, peArchitecture } from './binary-inspect.mjs';
import { INSTALL_URL, discoverEditor, notInstalledMessage, searchedPlaces } from './editor-discovery.mjs';
import { processAlive, startProbe } from './mcp-probe.mjs';
import { codexLaunchSpec } from './codex-config.mjs';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const noLaunch = has('--no-launch');
const closeEditor = has('--close-editor');

const client = pluginClient();
const results = [];
const pass = (label, detail = '') => results.push({ ok: true, label, detail });
const warn = (label, detail = '') => results.push({ ok: true, warn: true, label, detail });
const fail = (label, remedy, detail = '') => results.push({ ok: false, label, remedy, detail });

process.stdout.write(`\nSimpleVlogEditor — ${client.label} plugin doctor\n`);
process.stdout.write(`Plugin folder: ${PLUGIN_ROOT}\n\n`);

// ------------------------------------------------------------------- package

const major = Number(process.versions.node.split('.')[0]);
if (major >= 18) pass('Node.js', process.version);
else fail('Node.js', 'Install Node.js 18 or newer.', process.version);

const manifest = readManifest();
if (manifest) pass('plugin manifest', `${path.relative(PLUGIN_ROOT, client.manifestPath)} · version ${manifest.version}`);
else fail('plugin manifest', 'Reinstall the plugin: its manifest is missing or unreadable.', client.manifestPath || '(none)');

let servers = {};
try {
  if (manifest && typeof manifest.mcpServers === 'string') {
    servers = JSON.parse(fs.readFileSync(path.resolve(PLUGIN_ROOT, manifest.mcpServers), 'utf8')).mcpServers ?? {};
  } else if (manifest?.mcpServers && typeof manifest.mcpServers === 'object') {
    servers = manifest.mcpServers;
  }
} catch (error) { fail('MCP declaration', 'Restore .mcp.json.', error.message); }
const server = servers['simple-vlog-editor'];
let declaredLaunch = null;
if (server && (server.args || []).some((value) => String(value).endsWith('mcp-launcher.mjs'))) {
  pass('MCP declaration', `simple-vlog-editor → ${server.command} ${server.args.join(' ')}`);
} else {
  fail('MCP declaration', 'The manifest must declare the simple-vlog-editor server running scripts/mcp-launcher.mjs.');
}
try {
  declaredLaunch = codexLaunchSpec(PLUGIN_ROOT);
  pass('Codex process configuration', `cwd ${declaredLaunch.cwd}; only declared environment variables forwarded`);
} catch (error) {
  fail('Codex process configuration', 'Restore the plugin MCP configuration.', error.message);
}

for (const [label, relative] of [
  ['launcher', 'scripts/mcp-launcher.mjs'],
  ['editing skill', 'skills/edit-video/SKILL.md'],
  ['vlog editing skill', 'skills/edit-vlog/SKILL.md'],
  ['MCP operations reference', 'skills/edit-video/references/mcp-operations.md']
]) {
  if (fs.existsSync(path.join(PLUGIN_ROOT, relative))) pass(label, relative);
  else fail(label, 'Reinstall the plugin; a file is missing.', relative);
}

// ------------------------------------------------------------------- runtime

let target = null;
let launchable = true;

const discovery = process.env.SVE_RUNTIME_MODE === 'dev' ? { found: null, searched: [] } : discoverEditor({ environment: declaredLaunch?.env || {} });
if (process.env.SVE_RUNTIME_MODE === 'dev') {
  warn('SimpleVlogEditor', 'SVE_RUNTIME_MODE=dev: the source checkout in SVE_DEV_EDITOR_ROOT is used instead of the installed editor');
  target = { kind: 'checkout' };
} else if (discovery.found) {
  const found = discovery.found;
  target = found;
  pass('SimpleVlogEditor installed', `${found.executable}${found.version ? ` · ${found.version}` : ''}`);
  if (process.platform === 'win32') {
    const architecture = peArchitecture(found.executable);
    if (architecture === process.arch) pass('editor architecture', `${architecture} (PE header)`);
    else warn('editor architecture', `executable is ${architecture || 'unknown'}, this computer is ${process.arch}`);
  }
  if (archiveHasFile(found.archive, PACKAGED_HOST_MARKER.join('/'))) pass('packaged MCP mode', '--mcp-stdio supported');
  if (fs.existsSync(found.site)) pass('editor interface', 'resources/site/index.html');
  else fail('editor interface', `Reinstall SimpleVlogEditor from ${INSTALL_URL}.`, found.site);
  const probeExe = path.join(found.runtimeDir, 'resources', 'bin', platformKey().startsWith('win32') ? 'ffprobe.exe' : 'ffprobe');
  if (fs.existsSync(probeExe)) {
    const probe = spawnSync(probeExe, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (probe.status === 0) pass('FFprobe', `installed with the editor — ${(probe.stdout || '').split('\n')[0].slice(0, 60)}`);
    else fail('FFprobe', `The FFprobe installed with the editor does not run; reinstall SimpleVlogEditor from ${INSTALL_URL}.`,
      (probe.error?.message || probe.stderr || `exit code ${probe.status}`).trim());
  } else {
    const onPath = spawnSync('ffprobe', ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (onPath.status === 0) pass('FFprobe', `on PATH — ${(onPath.stdout || '').split('\n')[0]}`);
    else warn('FFprobe', 'not installed with the editor and not on PATH: importing media through MCP needs it');
  }
} else {
  launchable = false;
  fail('SimpleVlogEditor installed', notInstalledMessage(discovery),
    ['Looked only in the installer\'s default folders:', ...searchedPlaces(declaredLaunch?.env || {}).map((place) => `  - ${place}`)].join('\n'));
}

// --------------------------------------------------------------- MCP session

async function session() {
  const probe = startProbe({ ...declaredLaunch, env: { ...declaredLaunch.env, SVE_SKIP_UPDATE_CHECK: '1' } });
  let electronPid = null;
  try {
    const hello = await probe.initialize();
    pass('MCP stdio handshake', `${hello.serverInfo?.name} ${hello.serverInfo?.version} · protocol ${hello.protocolVersion}`);
    const { tools } = await probe.request('tools/list');
    if (tools.length >= 20) pass('MCP tools', `${tools.length} tools`);
    else fail('MCP tools', `The host answered with too few tools; reinstall SimpleVlogEditor from ${INSTALL_URL}.`, tools.map((entry) => entry.name).join(', '));
    const health = await probe.tool('health_check', {}, 90_000);
    const diagnostics = await probe.tool('get_diagnostics', {}, 90_000);
    electronPid = diagnostics?.result?.electronPid || health?.result?.electronPid || null;
    if (electronPid && processAlive(electronPid)) pass('Electron starts in MCP mode', `window process ${electronPid}, ${diagnostics.result.windowCount} window(s)`);
    else fail('Electron starts in MCP mode', 'Open the editor once by hand to see what it reports.', JSON.stringify(health?.result || {}).slice(0, 300));
    const recovery = await probe.tool('get_recovery_state', {}, 60_000);
    if (recovery?.result?.path) pass('recovery checkpoint', recovery.result.path);
    if (closeEditor) {
      await probe.tool('close_editor', {}, 60_000);
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && processAlive(electronPid)) await new Promise((resolve) => setTimeout(resolve, 250));
      if (!processAlive(electronPid)) pass('close_editor', 'window process ended');
      else fail('close_editor', 'The editor did not close; close it by hand.', `pid ${electronPid}`);
    }
  } catch (error) {
    fail('MCP session', 'See the messages below; run the doctor again after fixing them.', `${error.message}\n${probe.stderr().split('\n').slice(-8).join('\n')}`);
  } finally {
    const outcome = await probe.close();
    if (probe.contamination.length) {
      fail('stdout carries only MCP', 'Something printed to stdout; report this as a bug.', probe.contamination.slice(0, 3).join('\n'));
    } else {
      pass('stdout carries only MCP', 'no stray output');
    }
    if (outcome.timedOut) fail('launcher exits with the session', 'The launcher did not exit after stdin closed; report this as a bug.');
    else pass('launcher exits with the session', `exit code ${outcome.code}`);
  }
}

if (launchable && target && declaredLaunch && !noLaunch) await session();
else if (noLaunch) warn('MCP session', 'skipped (--no-launch)');

// -------------------------------------------------------------------- report

const width = Math.max(...results.map((entry) => entry.label.length));
for (const entry of results) {
  const mark = !entry.ok ? 'FAIL' : entry.warn ? 'warn' : 'ok  ';
  process.stdout.write(`  ${mark}  ${entry.label.padEnd(width)}  ${String(entry.detail || '').split('\n')[0]}`.trimEnd() + '\n');
}
const problems = results.filter((entry) => !entry.ok);
if (!problems.length) {
  process.stdout.write('\nEverything the plugin needs is in place.\n\n');
  process.exit(0);
}
process.stdout.write(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} to fix:\n\n`);
for (const entry of problems) {
  process.stdout.write(`  ${entry.label}\n      ${entry.remedy}\n`);
  if (entry.detail) process.stdout.write(`      ${String(entry.detail).split('\n').join('\n      ')}\n`);
  process.stdout.write('\n');
}
process.exit(1);
