/**
 * What the plugin says when SimpleVlogEditor is not installed.
 *
 * Failing to start would be the wrong answer: the client would show a broken
 * server and the conversation would have nothing to act on. Instead the
 * launcher speaks MCP itself, just enough to say that the editor is not
 * installed and where to get it (INSTALL_URL). Only the installer's default
 * folders are ever searched — there is no file picker and no path to type in.
 * `check_installation` looks there again, so once the user has installed the
 * editor the session continues without a restart: the real host is started,
 * given the same handshake the client already made, and from then on the
 * launcher is a plain wire again. The client is told the tool list changed,
 * and sees the editor's full set of tools.
 *
 * This is the only code in the plugin that parses MCP messages, and it stops
 * parsing at the handover.
 */

import os from 'node:os';
import path from 'node:path';
import { startHost } from './mcp-proxy.mjs';

const HANDOVER_INIT_ID = '__sve_launcher_handover__';
const HANDOVER_TIMEOUT_MS = 60_000;

const TOOLS = [
  {
    name: 'check_installation',
    description:
      'SimpleVlogEditor is not installed on this computer, so its editing tools are not available. ' +
      'Tell the user, in their language, to download the installer from https://simplevlogeditor.com/, install it ' +
      '(keeping the default installation folder) and tell you when it is done; then call this tool. It looks in the ' +
      'installer\'s default folders again and, when the editor is there, connects it and the full list of editing tools appears.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'health_check',
    description: 'Report that the editor is not installed, where the plugin looked, and where to download it.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_editor_capabilities',
    description: 'Not available: SimpleVlogEditor is not installed. See check_installation.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
];

/**
 * @param {{
 *   discover: () => {found: object|null, searched: object[]},
 *   launchSpec: (found: object) => {command, args, env, cwd},
 *   searchedPlaces: string[],
 *   message: (discovery: object) => string,
 *   installUrl: string,
 *   notice?: string,
 *   stdin?, stdout?, stderr?
 * }} options
 */
export function runSetupServer(options) {
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;

  let buffer = '';
  let initializeParams = null;
  let clientInitialized = false;
  let handingOver = false;
  let handedOver = false;
  const queued = [];
  let lastSearch = options.initial || { found: null, searched: [], outdated: null };

  const send = (message) => stdout.write(JSON.stringify(message) + '\n');
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const text = (id, body, isError = false, structured = undefined) => reply(id, {
    content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body, null, 2) }],
    ...(structured ? { structuredContent: structured } : {}),
    ...(isError ? { isError: true } : {})
  });

  const status = () => ({
    state: lastSearch.outdated ? 'editor_outdated' : 'editor_not_installed',
    message: options.message(lastSearch),
    downloadUrl: options.installUrl,
    searchedPlaces: options.searchedPlaces,
    lookedAt: lastSearch.searched,
    nextStep: `Tell the user, in their language, that SimpleVlogEditor ${lastSearch.outdated ? 'must be updated' : 'is not installed'}: ` +
      `download the installer from ${options.installUrl}, install it keeping the default folder, then call check_installation.`,
    ...(options.notice ? { updateNotice: options.notice } : {})
  });

  async function handover(found, callId) {
    handingOver = true;
    const spec = options.launchSpec(found);
    let failed = null;
    const host = startHost({
      ...spec, stdin, stdout, stderr, pipeStdin: false, pipeStdout: false,
      exit: (code) => {
        if (handedOver) process.exit(code);
        failed = failed || new Error(`the editor's MCP host exited with code ${code} while starting`);
      }
    });

    // Replay the handshake the client already made, and wait for the answer.
    const answered = await new Promise((resolve) => {
      let pending = '';
      const timer = setTimeout(() => finish(new Error('the editor did not answer the MCP handshake in time')), HANDOVER_TIMEOUT_MS);
      const poll = setInterval(() => { if (failed) finish(failed); }, 100);
      function finish(error, rest = '') {
        clearTimeout(timer);
        clearInterval(poll);
        host.child.stdout.removeListener('data', onData);
        resolve({ error, rest });
      }
      function onData(chunk) {
        pending += chunk;
        let at;
        while ((at = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, at);
          pending = pending.slice(at + 1);
          try {
            const message = JSON.parse(line);
            if (message.id === HANDOVER_INIT_ID) return finish(message.error ? new Error(message.error.message) : null, pending);
          } catch { /* not ours */ }
          stdout.write(line + '\n');
        }
      }
      host.child.stdout.setEncoding('utf8');
      host.child.stdout.on('data', onData);
      host.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: HANDOVER_INIT_ID, method: 'initialize', params: initializeParams || { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'simple-vlog-editor-launcher', version: '1' } } }) + '\n');
    });

    if (answered.error) {
      host.stop();
      handingOver = false;
      return text(callId, `The editor at ${found.executable || found.projectRoot} was found but did not start: ${answered.error.message}. ` +
        `Ask the user to open it once by hand to see what it reports, or to reinstall it from ${options.installUrl}.`, true);
    }

    if (clientInitialized) host.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    handedOver = true;
    stderr.write(`[simple-vlog-editor] editor connected: ${found.executable || found.projectRoot}\n`);
    text(callId, {
      connected: true,
      editor: found.executable || found.projectRoot,
      source: found.source,
      note: 'The editor is connected. Its full list of editing tools is now available — list the tools again and continue.'
    });
    send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });

    // From here on: a wire.
    if (answered.rest) stdout.write(answered.rest);
    host.child.stdout.pipe(stdout, { end: false });
    stdin.removeListener('data', onInput);
    if (buffer) { host.child.stdin.write(buffer); buffer = ''; }
    for (const line of queued.splice(0)) host.child.stdin.write(line + '\n');
    stdin.pipe(host.child.stdin);
    return undefined;
  }

  async function checkInstallation(id) {
    // The user may have installed it meanwhile: look in the default folders again.
    lastSearch = options.discover();
    if (lastSearch.found) return handover(lastSearch.found, id);
    return text(id, { connected: false, ...status() }, true);
  }

  async function handle(message) {
    const { id, method, params } = message;
    const isRequest = id !== undefined && id !== null;
    try {
      switch (method) {
        case 'initialize':
          initializeParams = params || null;
          return reply(id, {
            protocolVersion: ['2025-06-18', '2025-03-26', '2024-11-05'].includes(params?.protocolVersion) ? params.protocolVersion : '2025-06-18',
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'simple-vlog-editor', version: 'launcher' },
            instructions: `SimpleVlogEditor is not installed on this computer (the plugin only looks in the installer's default folders). ` +
              `Before anything else, tell the user in their language to download the installer from ${options.installUrl}, install it keeping the default folder, ` +
              'and let you know when it is done; then call check_installation, and the complete editing toolset appears.'
          });
        case 'notifications/initialized':
          clientInitialized = true;
          return undefined;
        case 'ping':
          return isRequest ? reply(id, {}) : undefined;
        case 'tools/list':
          return reply(id, { tools: TOOLS });
        case 'tools/call': {
          const name = params?.name;
          if (name === 'check_installation' || name === 'locate_editor') return await checkInstallation(id);
          if (name === 'health_check') return text(id, status(), false, { apiVersion: 2, projectRevision: 0, result: status() });
          if (name === 'get_editor_capabilities') {
            return text(id, { ...status(), capabilities: null }, true);
          }
          return text(id, `"${name}" is not available: ${options.message(lastSearch)}`, true);
        }
        default:
          if (!isRequest) return undefined;
          return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
      }
    } catch (error) {
      if (isRequest) send({ jsonrpc: '2.0', id, error: { code: -32603, message: error?.message || String(error) } });
      return undefined;
    }
  }

  function onInput(chunk) {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      if (!line.trim()) continue;
      if (handingOver) { queued.push(line); continue; }
      let message;
      try { message = JSON.parse(line); }
      catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
      // Replies to anything the host asks are only meaningful after handover.
      if (message.method === undefined) continue;
      void handle(message);
    }
  }

  stdin.setEncoding?.('utf8');
  stdin.on('data', onInput);
  stdin.once('end', () => { if (!handedOver) process.exit(0); });
  stderr.write(`[simple-vlog-editor] ${options.message(lastSearch)} (${os.hostname()}). Waiting for check_installation. Searched:\n` +
    options.searchedPlaces.map((place) => `  - ${place}`).join('\n') + '\n');
}

export const _internals = { TOOLS, HANDOVER_INIT_ID, path };
