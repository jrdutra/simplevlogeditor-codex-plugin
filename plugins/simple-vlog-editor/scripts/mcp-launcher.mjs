#!/usr/bin/env node

/**
 * The process the MCP client starts. It works out which editor to run, starts
 * that editor's MCP host as a child, and becomes a transparent stdio wire
 * between the two (see mcp-proxy.mjs).
 *
 * Which editor: only the one the Windows installer put in its default folder
 * (%ProgramFiles%\SimpleVlogEditor, or %LOCALAPPDATA%\Programs\SimpleVlogEditor
 * for a "just for me" install — see editor-discovery.mjs). The host is that
 * editor's own executable running as Node (`ELECTRON_RUN_AS_NODE`) on the
 * `mcp-host.js` inside its archive, started with `--mcp-stdio`. When it is not
 * installed, the plugin says so and points to https://simplevlogeditor.com/
 * (setup-server.mjs).
 *
 * `SVE_RUNTIME_MODE=dev` with `SVE_DEV_EDITOR_ROOT` runs a source checkout
 * instead — for developing the editor only.
 *
 * Nothing but MCP is ever written to stdout. Everything else goes to stderr.
 */

import { main } from './launcher-core.mjs';

main().catch((error) => {
  process.stderr.write(`[simple-vlog-editor] launcher failed: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
