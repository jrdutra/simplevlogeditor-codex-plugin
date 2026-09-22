import fs from 'node:fs';
import path from 'node:path';

/** Resolve the declaration from an installed plugin, independent of the task cwd.
 * Deliberately forward only declared variables: inheriting the doctor's whole
 * environment previously hid missing Windows installation/profile variables.
 */
export function codexLaunchSpec(pluginRoot, environment = process.env) {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.codex-plugin/plugin.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.resolve(pluginRoot, manifest.mcpServers), 'utf8'));
  const server = config.mcpServers?.['simple-vlog-editor'];
  if (!server?.command || server.enabled === false) throw new Error('The Simple Vlog Editor MCP server is missing or disabled.');
  if (!server.cwd) throw new Error('The plugin MCP declaration needs cwd relative to the plugin root.');
  const cwd = path.resolve(pluginRoot, server.cwd);
  const relative = path.relative(pluginRoot, cwd);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('The MCP working directory must stay inside the plugin.');
  }
  const env = {};
  for (const entry of server.env_vars || []) {
    const name = typeof entry === 'string' ? entry : entry.name;
    const key = Object.keys(environment).find((key) => process.platform === 'win32'
      ? key.toLowerCase() === name.toLowerCase() : key === name);
    if (key !== undefined) env[name] = environment[key];
  }
  Object.assign(env, server.env || {});
  return { command: server.command, args: server.args || [], cwd, env };
}
