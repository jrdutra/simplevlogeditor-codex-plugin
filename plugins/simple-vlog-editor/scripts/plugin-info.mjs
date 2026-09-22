/**
 * What this plugin is, read from its own folder.
 *
 * The same scripts ship in the Claude Code plugin and in the Codex plugin.
 * Everything that differs between the two is discovered here rather than
 * written into the scripts, so the scripts can stay byte-for-byte identical.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

/** The plugin folder: the parent of `scripts/`, wherever it was installed. */
export const PLUGIN_ROOT = path.resolve(scriptDir, '..');

const CLIENTS = [
  { id: 'claude', manifestDir: '.claude-plugin', controller: 'claude-code', label: 'Claude Code' },
  { id: 'codex', manifestDir: '.codex-plugin', controller: 'codex', label: 'Codex' }
];

/** `{ id, manifestDir, manifestPath, controller, label }` for the client this copy was built for. */
export function pluginClient(root = PLUGIN_ROOT) {
  for (const client of CLIENTS) {
    const manifestPath = path.join(root, client.manifestDir, 'plugin.json');
    if (fs.existsSync(manifestPath)) return { ...client, manifestPath };
  }
  return { id: 'unknown', manifestDir: null, manifestPath: null, controller: 'mcp', label: 'MCP client' };
}

export function readManifest(root = PLUGIN_ROOT) {
  const { manifestPath } = pluginClient(root);
  if (!manifestPath) return null;
  try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return null; }
}

export function pluginVersion(root = PLUGIN_ROOT) {
  const version = readManifest(root)?.version;
  return typeof version === 'string' ? version.trim() : '';
}
