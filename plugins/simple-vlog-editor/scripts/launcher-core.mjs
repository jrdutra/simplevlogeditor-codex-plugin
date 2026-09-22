/**
 * Everything the launcher decides, as functions the doctor and the tests can
 * call without starting a session. `mcp-launcher.mjs` is the entry point.
 */

import os from 'node:os';
import path from 'node:path';
import { pluginClient } from './plugin-info.mjs';
import { RuntimeError } from './runtime-location.mjs';
import { INSTALL_URL, discoverEditor, inspectCandidate, notInstalledMessage, searchedPlaces } from './editor-discovery.mjs';
import { startHost } from './mcp-proxy.mjs';
import { runSetupServer } from './setup-server.mjs';
import { updateNotice } from './version-check.mjs';

const log = (line) => process.stderr.write(`[simple-vlog-editor] ${line}\n`);

function argumentValue(name) {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

/** Where the runtime writes its own log when nobody chose a place. */
function defaultLogFile() {
  const base = process.env.LOCALAPPDATA || process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(base, 'SimpleVlogEditor', 'logs', 'mcp-runtime.log');
}

export function hostEnvironment(extra = {}) {
  const controller = process.env.SVE_CONTROLLER || pluginClient().controller;
  const environment = {
    ...process.env,
    SVE_CONTROLLER: controller,
    SVE_MCP_LOG_FILE: process.env.SVE_MCP_LOG_FILE || defaultLogFile(),
    ...extra
  };
  return { controller, environment };
}

/** How to start the host of the installed editor, or of a developer's checkout. */
export function launchSpecFor(target, extra = {}) {
  const { controller, environment } = hostEnvironment(extra);
  if (target.kind === 'checkout') {
    delete environment.ELECTRON_RUN_AS_NODE;
    return {
      command: process.execPath,
      args: [target.hostEntry, '--mcp-stdio', '--controller', controller, ...(process.argv.includes('--dev') ? ['--dev'] : [])],
      env: { ...environment, SVE_EDITOR_PROJECT_ROOT: target.projectRoot },
      cwd: path.join(target.projectRoot, 'electron')
    };
  }
  return {
    command: target.executable,
    args: [target.hostEntry, '--mcp-stdio', '--controller', controller],
    env: { ...environment, ELECTRON_RUN_AS_NODE: '1' },
    cwd: target.runtimeDir
  };
}

/** SVE_RUNTIME_MODE=dev: a source checkout named explicitly — for developing the editor, never searched for. */
function devTarget() {
  const pinned = process.env.SVE_DEV_EDITOR_ROOT || process.env.SVE_EDITOR_PROJECT_ROOT;
  if (!pinned) return null;
  const inspected = inspectCandidate(pinned);
  return inspected?.kind === 'checkout' && inspected.ok ? inspected : null;
}

/**
 * Decides what to start: the editor in the installer's default folder, and
 * nothing else. Returns a target, or throws a RuntimeError, or null for
 * "not installed" (the launcher then says so and where to download it).
 */
export function chooseTarget(mode = process.env.SVE_RUNTIME_MODE || '') {
  const pinned = String(mode).trim().toLowerCase();
  if (pinned === 'dev') {
    const target = devTarget();
    if (!target) throw new RuntimeError('dev_checkout_missing', 'SVE_RUNTIME_MODE=dev needs SVE_DEV_EDITOR_ROOT pointing at a built SimpleVlogEditor source checkout.');
    return target;
  }
  if (pinned && pinned !== 'installed') {
    throw new RuntimeError('invalid_mode', `SVE_RUNTIME_MODE must be installed or dev, not "${mode}".`);
  }
  const discovery = discoverEditor();
  if (discovery.found) return discovery.found;
  log(notInstalledMessage(discovery));
  return null;
}

export async function main() {
  if (process.argv.includes('--locate')) {
    // A diagnostic, not an MCP session: stdout is free to use here.
    try {
      const target = chooseTarget();
      if (!target) { process.stdout.write('not-found\n'); process.exitCode = 3; return; }
      const spec = launchSpecFor(target);
      process.stdout.write(JSON.stringify({ kind: target.kind, command: spec.command, args: spec.args, cwd: spec.cwd }) + '\n');
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 2;
    }
    return;
  }

  if (process.env.SVE_MCP_ROOTS) {
    log(`SVE_MCP_ROOTS is set, so the editor's default media folders stand down: ${process.env.SVE_MCP_ROOTS}`);
  }

  // Asked before the first tool call; the host carries it into the answers
  // every session starts with, and the skill tells the assistant to say it.
  const notice = await updateNotice().catch(() => null);
  if (notice) log(notice);
  const extra = notice ? { SVE_UPDATE_NOTICE: notice } : {};

  let target;
  try {
    target = chooseTarget(argumentValue('--mode') || process.env.SVE_RUNTIME_MODE || '');
  } catch (error) {
    log(error.message);
    process.exitCode = 1;
    return;
  }

  if (!target) {
    runSetupServer({
      initial: discoverEditor(),
      discover: () => discoverEditor(),
      launchSpec: (found) => launchSpecFor(found, extra),
      message: (discovery) => notInstalledMessage(discovery),
      installUrl: INSTALL_URL,
      searchedPlaces: searchedPlaces(),
      notice
    });
    return;
  }

  log(`starting ${target.kind === 'checkout' ? `the source checkout at ${target.projectRoot} (SVE_RUNTIME_MODE=dev)` : `the installed editor ${target.executable}`}`);
  startHost(launchSpecFor(target, extra));
}
