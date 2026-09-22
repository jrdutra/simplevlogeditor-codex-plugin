/**
 * Reading two binary formats just far enough to check a runtime without
 * running it: the Electron archive (`app.asar`) and the Windows executable
 * header. Used by the launcher to refuse an editor too old to be started this
 * way, and by the doctor to prove the runtime is what it claims to be — both
 * from plain Node, on any platform, with nothing installed.
 */

import fs from 'node:fs';
import path from 'node:path';

// ------------------------------------------------------------------------ asar

/**
 * The archive's table of contents.
 *
 * Layout: a 4-byte pickle whose payload is the size of the header pickle, then
 * the header pickle (4-byte payload size, 4-byte string length, the JSON).
 * File data begins right after the header pickle.
 */
export function readAsarHeader(archive) {
  const handle = fs.openSync(archive, 'r');
  try {
    const sizeBuffer = Buffer.alloc(8);
    if (fs.readSync(handle, sizeBuffer, 0, 8, 0) !== 8) throw new Error('truncated asar size pickle');
    const headerPickleSize = sizeBuffer.readUInt32LE(4);
    if (!headerPickleSize || headerPickleSize > 64 * 1024 * 1024) throw new Error('implausible asar header size');
    const headerBuffer = Buffer.alloc(headerPickleSize);
    if (fs.readSync(handle, headerBuffer, 0, headerPickleSize, 8) !== headerPickleSize) throw new Error('truncated asar header');
    const stringLength = headerBuffer.readUInt32LE(4);
    const json = headerBuffer.toString('utf8', 8, 8 + stringLength);
    return { header: JSON.parse(json), dataOffset: 8 + headerPickleSize };
  } finally {
    fs.closeSync(handle);
  }
}

function entryAt(header, relative) {
  let node = header;
  for (const part of relative.split(/[\\/]+/).filter(Boolean)) {
    if (!node || !node.files || !Object.prototype.hasOwnProperty.call(node.files, part)) return null;
    node = node.files[part];
  }
  return node;
}

/** True when `relative` (e.g. `src/mcp-host.js`) is a file in the archive. */
export function asarHasFile(archive, relative) {
  try {
    const entry = entryAt(readAsarHeader(archive).header, relative);
    return Boolean(entry && !entry.files && (entry.size !== undefined || entry.link));
  } catch {
    return false;
  }
}

/** A small file's contents as UTF-8, or null. Unpacked entries live beside the archive. */
export function readAsarText(archive, relative, maxBytes = 4 * 1024 * 1024) {
  try {
    const { header, dataOffset } = readAsarHeader(archive);
    const entry = entryAt(header, relative);
    if (!entry || entry.files || entry.size === undefined || entry.size > maxBytes) return null;
    if (entry.unpacked) return fs.readFileSync(path.join(`${archive}.unpacked`, relative), 'utf8');
    const buffer = Buffer.alloc(entry.size);
    const handle = fs.openSync(archive, 'r');
    try { fs.readSync(handle, buffer, 0, entry.size, dataOffset + Number(entry.offset)); }
    finally { fs.closeSync(handle); }
    return buffer.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Reads a file from an archive that may also be a plain folder of the same
 * name — which is what a test runtime, or an unpacked development copy, uses.
 */
export function archiveHasFile(archive, relative) {
  try {
    if (fs.statSync(archive).isDirectory()) return fs.existsSync(path.join(archive, relative));
  } catch {
    return false;
  }
  return asarHasFile(archive, relative);
}

export function archiveText(archive, relative) {
  try {
    if (fs.statSync(archive).isDirectory()) return fs.readFileSync(path.join(archive, relative), 'utf8');
  } catch {
    return null;
  }
  return readAsarText(archive, relative);
}

// ------------------------------------------------------------------------- PE

const MACHINES = { 0x8664: 'x64', 0xaa64: 'arm64', 0x014c: 'ia32' };

/** The CPU a Windows executable was built for (`x64`, `arm64`, `ia32`), or null. */
export function peArchitecture(executable) {
  let handle;
  try {
    handle = fs.openSync(executable, 'r');
    const dos = Buffer.alloc(64);
    if (fs.readSync(handle, dos, 0, 64, 0) !== 64 || dos.toString('latin1', 0, 2) !== 'MZ') return null;
    const offset = dos.readUInt32LE(0x3c);
    const pe = Buffer.alloc(6);
    if (fs.readSync(handle, pe, 0, 6, offset) !== 6 || pe.toString('latin1', 0, 4) !== 'PE\0\0') return null;
    return MACHINES[pe.readUInt16LE(4)] || `unknown-0x${pe.readUInt16LE(4).toString(16)}`;
  } catch {
    return null;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}
