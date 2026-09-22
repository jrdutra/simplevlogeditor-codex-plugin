/**
 * What an installed SimpleVlogEditor looks like to the plugin: the executable
 * for each platform, the archive beside it, and the MCP host inside that
 * archive. Only Windows x64 is shipped today.
 */

import path from 'node:path';

/** Platforms a runtime can be built for, and the executable each one carries. */
export const RUNTIME_PLATFORMS = {
  'win32-x64': { executable: 'SimpleVlogEditor.exe', shipped: true },
  // Prepared, not shipped. Adding one is a build target plus `shipped: true`.
  'win32-arm64': { executable: 'SimpleVlogEditor.exe', shipped: false },
  'darwin-arm64': { executable: 'SimpleVlogEditor.app/Contents/MacOS/SimpleVlogEditor', shipped: false },
  'darwin-x64': { executable: 'SimpleVlogEditor.app/Contents/MacOS/SimpleVlogEditor', shipped: false },
  'linux-x64': { executable: 'simplevlogeditor', shipped: false }
};

/** The file inside the archive that proves it can be started as an MCP host. */
export const HOST_ENTRY = ['src', 'mcp-host.js'];
/** Present only in editors that can open their window from a packaged host. */
export const PACKAGED_HOST_MARKER = ['src', 'mcp-stdio-entry.js'];

export class RuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
    this.details = details;
  }
}

export function platformKey(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

/**
 * What a runtime folder looks like to the rest of the plugin: the executable,
 * its archive and the host inside it. The installed editor has this layout.
 */
export function describeRuntime(runtimeDir, executableName) {
  const executable = path.join(runtimeDir, executableName);
  const archive = path.join(runtimeDir, 'resources', 'app.asar');
  return {
    runtimeDir,
    executable,
    archive,
    hostEntry: path.join(archive, ...HOST_ENTRY),
    site: path.join(runtimeDir, 'resources', 'site', 'index.html')
  };
}
