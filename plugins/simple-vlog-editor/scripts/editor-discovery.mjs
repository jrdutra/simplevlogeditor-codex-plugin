/**
 * Finding the SimpleVlogEditor this plugin drives.
 *
 * Only where the Windows installer puts it — nowhere else. No portable copies,
 * no remembered paths, no copies left inside AI client plugin folders, no
 * source checkouts: the one editor a plugin starts is the one the user
 * installed, so an old or stray copy can never end up driving a session.
 *
 * The installer (NSIS) offers two modes, and each has one default folder:
 *    for all users   %ProgramFiles%\SimpleVlogEditor
 *    just for me     %LOCALAPPDATA%\Programs\SimpleVlogEditor
 * (the package name, simplevlogeditor-desktop, is accepted in both places too:
 * it is the folder name some installer versions use.)
 *
 * When none of them holds a usable editor the plugin says the editor is not
 * installed and sends the user to INSTALL_URL. Developers can still point the
 * plugin at a source checkout, explicitly, with SVE_RUNTIME_MODE=dev.
 */

import fs from 'node:fs';
import path from 'node:path';
import { archiveHasFile, archiveText } from './binary-inspect.mjs';
import { HOST_ENTRY, PACKAGED_HOST_MARKER, RUNTIME_PLATFORMS, describeRuntime, platformKey } from './runtime-location.mjs';

/** Where the user downloads the installer. */
export const INSTALL_URL = 'https://simplevlogeditor.com/';

const PRODUCT = 'SimpleVlogEditor';
const FOLDER_NAMES = [PRODUCT, 'simplevlogeditor-desktop'];

function executableName(platform = process.platform, arch = process.arch) {
  return (RUNTIME_PLATFORMS[platformKey(platform, arch)] || RUNTIME_PLATFORMS['win32-x64']).executable;
}

// ---------------------------------------------------------------- inspecting one

/**
 * What is at `candidate` — an executable, the folder that holds one, or a
 * source checkout — and whether it can serve MCP the way this plugin starts it.
 *
 * @returns {null | { kind: 'executable'|'checkout', ok: boolean, reason?: string, ... }}
 */
export function inspectCandidate(candidate, options = {}) {
  if (!candidate || typeof candidate !== 'string') return null;
  const name = options.executableName || executableName(options.platform, options.arch);
  let resolved = path.resolve(candidate.trim().replace(/^"(.*)"$/, '$1'));
  let stat;
  try { stat = fs.statSync(resolved); } catch { return null; }

  // A source checkout: electron/src/mcp-host.js with its development Electron.
  if (stat.isDirectory() && fs.existsSync(path.join(resolved, 'electron', 'src', 'mcp-host.js'))) {
    const electronInstalled = fs.existsSync(path.join(resolved, 'electron', 'node_modules', 'electron', 'package.json'));
    const siteBuilt = fs.existsSync(path.join(resolved, 'web', 'dist', 'browser', 'index.html'));
    return {
      kind: 'checkout',
      projectRoot: resolved,
      hostEntry: path.join(resolved, 'electron', 'src', 'mcp-host.js'),
      ok: electronInstalled && siteBuilt,
      reason: !electronInstalled ? 'its Electron dependencies are not installed (npm install in electron)'
        : !siteBuilt ? 'its site has not been built (build.bat)' : undefined
    };
  }

  // A folder: the executable directly inside it, or one level down (the
  // folder a portable zip was extracted into, holding the app's own folder).
  if (stat.isDirectory()) {
    const direct = path.join(resolved, name);
    if (fs.existsSync(direct)) resolved = direct;
    else {
      let found = null;
      try {
        for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const nested = path.join(resolved, entry.name, name);
          if (fs.existsSync(nested)) { found = nested; break; }
        }
      } catch { /* unreadable folder */ }
      if (!found) return null;
      resolved = found;
    }
  } else if (path.basename(resolved).toLowerCase() !== path.basename(name).toLowerCase()) {
    return null;
  }

  const runtime = describeRuntime(path.dirname(resolved), path.basename(resolved));
  if (!archiveHasFile(runtime.archive, HOST_ENTRY.join('/'))) {
    return { kind: 'executable', ...runtime, executable: resolved, ok: false, reason: `${runtime.archive} does not contain the MCP host` };
  }
  if (!archiveHasFile(runtime.archive, PACKAGED_HOST_MARKER.join('/'))) {
    return {
      kind: 'executable', ...runtime, executable: resolved, ok: false, outdated: true,
      reason: `this SimpleVlogEditor is older than the plugin and cannot be started by it — install the current version from ${INSTALL_URL}`
    };
  }
  let version = null;
  try { version = JSON.parse(archiveText(runtime.archive, 'package.json') || '{}').version || null; } catch { /* unknown */ }
  if (!version || compareVersions(version, '1.1.3') < 0) {
    return { kind: 'executable', ...runtime, executable: resolved, version, ok: false, outdated: true,
      reason: `this SimpleVlogEditor (${version || 'unknown version'}) is older than the plugin requires (1.1.3); download and install the current version from ${INSTALL_URL}` };
  }
  return { kind: 'executable', ...runtime, executable: resolved, version, ok: true };
}

function compareVersions(a, b) {
  const parts = (value) => String(value || '0').split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let index = 0; index < 3; index++) if (x[index] !== y[index]) return x[index] < y[index] ? -1 : 1;
  return 0;
}

// ------------------------------------------------------------ the default folders

/** The installer's default folders, most common first. Nothing else is searched. */
export function installerLocations(environment = process.env) {
  const bases = [];
  const add = (value) => { if (value && !bases.includes(value)) bases.push(value); };
  // 64-bit Program Files even from a 32-bit Node, then whatever ProgramFiles says.
  add(environment.ProgramW6432);
  add(environment.ProgramFiles);
  const perUser = environment.LOCALAPPDATA ? path.join(environment.LOCALAPPDATA, 'Programs') : null;
  const folders = [];
  for (const base of bases) for (const name of FOLDER_NAMES) folders.push(path.join(base, name));
  if (perUser) for (const name of FOLDER_NAMES) folders.push(path.join(perUser, name));
  return folders;
}

/**
 * The installed editor, or why there is none.
 *
 * @returns {{ found: object|null, searched: Array<{path, result}>, outdated: object|null }}
 */
export function discoverEditor(options = {}) {
  const environment = options.environment || process.env;
  const name = options.executableName || executableName(options.platform, options.arch);
  const searched = [];
  let outdated = null;
  for (const folder of installerLocations(environment)) {
    const executable = path.join(folder, name);
    if (!fs.existsSync(executable)) { searched.push({ path: executable, result: 'not installed here' }); continue; }
    const inspected = inspectCandidate(executable, { executableName: name });
    if (!inspected) { searched.push({ path: executable, result: 'not a SimpleVlogEditor executable' }); continue; }
    searched.push({ path: executable, result: inspected.ok ? `usable${inspected.version ? ` (${inspected.version})` : ''}` : inspected.reason });
    if (inspected.ok) return { found: { ...inspected, source: 'installed' }, searched, outdated: null };
    if (inspected.outdated && !outdated) outdated = inspected;
  }
  return { found: null, searched, outdated };
}

/** The places a user can be told were searched, in words. */
export function searchedPlaces(environment = process.env) {
  return installerLocations(environment);
}

/** What to tell the user when the editor is missing or too old. */
export function notInstalledMessage(discovery = {}, environment = process.env) {
  if (discovery.outdated) {
    return `The SimpleVlogEditor installed at ${discovery.outdated.executable} is too old for this plugin (${discovery.outdated.version || 'unknown version'}). ` +
      `Download the current installer from ${INSTALL_URL}, install it, and start a new conversation.`;
  }
  return `SimpleVlogEditor is not installed on this computer. Download the installer from ${INSTALL_URL}, install it (keep the default installation folder), ` +
    'and start a new conversation.' + (searchedPlaces(environment).length ? ` Looked in: ${searchedPlaces(environment).join('; ')}.` : ' (SimpleVlogEditor is installed on Windows only.)');
}
