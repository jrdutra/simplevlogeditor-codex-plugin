/**
 * The launcher's only job once it knows what to start: be a wire.
 *
 * For the MCP client, the launcher *is* the server — it is the process the
 * client started, and its stdin/stdout are the protocol. So the host is
 * spawned as a child and the three streams are joined byte for byte:
 *
 *     client ─stdin─▶ launcher ─▶ host stdin
 *     client ◀stdout─ launcher ◀─ host stdout
 *     client ◀stderr─ launcher ◀─ host stderr
 *
 * Nothing is parsed, re-serialised or buffered on the way — `pipe()` moves
 * chunks as they arrive — and nothing of the launcher's own is ever written to
 * stdout. Diagnostics go to stderr.
 *
 * Lifecycle, the part a wire has to get right:
 *
 *   client closes stdin      the host's stdin closes; it ends the session and
 *                            exits on its own. If it has not after a grace
 *                            period, it is killed.
 *   SIGINT / SIGTERM / SIGHUP forwarded to the host, which exits; so does this.
 *   parent disconnects       same as a closed stdin.
 *   host exits               this exits with the same code once stdout has
 *                            been flushed. The client sees the server end.
 *   stdout breaks (EPIPE)    the client is gone: the host is stopped.
 *
 * The visible editor window is not a child of either process — the host starts
 * it detached, because it is the user's editor and must outlive the session.
 */

import { spawn } from 'node:child_process';

const GRACE_MS = 5000;

export function spawnFailureMessage(error, command) {
  switch (error?.code) {
    case 'ENOENT': return `The editor executable was not found: ${command}`;
    case 'EACCES': return `The editor executable could not be started (permission denied): ${command}`;
    case 'EPERM': return `The editor executable was blocked by the system: ${command}`;
    default: return `The editor could not be started: ${error?.message || error}`;
  }
}

export function exitCodeFor(error) {
  return error?.code === 'ENOENT' ? 127 : error?.code === 'EACCES' || error?.code === 'EPERM' ? 126 : 1;
}

/**
 * Starts the host and joins the streams.
 *
 * @param {{command: string, args: string[], env: object, cwd?: string,
 *          stdin?: NodeJS.ReadableStream, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream,
 *          pipeStdin?: boolean, pipeStdout?: boolean, exit?: (code: number) => void}} options
 *   `pipeStdin` / `pipeStdout` false leave a direction to the caller, which is
 *   how the setup server replays the handshake before handing over.
 * @returns {{ child, done: Promise<number>, stop: (signal?) => void }}
 */
export function startHost(options) {
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const exit = options.exit || ((code) => process.exit(code));

  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true
  });

  let finished = false;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  let killTimer = null;

  const finish = (code) => {
    if (finished) return;
    finished = true;
    clearTimeout(killTimer);
    resolveDone(code);
    // Let whatever the host wrote last reach the client before leaving.
    if (stdout.writableLength > 0 && typeof stdout.once === 'function') {
      stdout.once('drain', () => exit(code));
      setTimeout(() => exit(code), 1000).unref?.();
    } else {
      exit(code);
    }
  };

  const stop = (signal = 'SIGTERM') => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try { child.kill(signal); } catch { /* already gone */ }
    clearTimeout(killTimer);
    killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, GRACE_MS);
    killTimer.unref?.();
  };

  child.once('error', (error) => {
    stderr.write(`[simple-vlog-editor] ${spawnFailureMessage(error, options.command)}\n`);
    finish(exitCodeFor(error));
  });
  child.once('exit', (code, signal) => {
    if (code !== 0 && code !== null) stderr.write(`[simple-vlog-editor] the MCP host exited with code ${code}\n`);
    if (signal) stderr.write(`[simple-vlog-editor] the MCP host was stopped by ${signal}\n`);
    finish(code ?? (signal ? 1 : 0));
  });

  // A write after the host has gone is not worth a crash.
  child.stdin.on('error', () => {});
  stdout.on?.('error', (error) => {
    if (error?.code === 'EPIPE' || error?.code === 'ERR_STREAM_DESTROYED') stop();
  });

  if (options.pipeStdout !== false) child.stdout.pipe(stdout, { end: false });
  child.stderr.pipe(stderr, { end: false });

  if (options.pipeStdin !== false) {
    stdin.pipe(child.stdin);
  }
  // Whether piped here or fed by the caller, the end of the client's stdin
  // is the end of the session.
  stdin.once?.('end', () => {
    if (options.pipeStdin === false) child.stdin.end();
    killTimer = setTimeout(() => stop('SIGTERM'), GRACE_MS);
    killTimer.unref?.();
  });

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    try { process.on(signal, () => stop(signal)); } catch { /* not supported on this platform */ }
  }
  process.on('disconnect', () => stop());

  return { child, done, stop };
}
