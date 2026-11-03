// #region Imports

import { gunzipSync } from 'node:zlib';
import { PACK_LIMITS } from './PackLimits.js';
import { PackProblem } from './PackProblem.js';

// #endregion

/**
 * A file of a pack, with its path relative to the root of the pack, in forward slashes.
 *
 * @public
 */
export interface IPackFile {
    path: string;
    bytes: Buffer;
}

/**
 * The size of a block of a tar archive.
 */
const BLOCK = 512;

/**
 * Reads the archive of a pack in memory. Nothing of it reaches the disk, so no path in it decides where anything is written, and
 * still a path that tries to leave the pack or a link refuses the whole archive: such an archive is no pack.
 *
 * @internal
 * @param compressed The bytes of a `.tar.gz`, as GitHub and npm serve them.
 * @returns The files, below the one top folder of the archive.
 * @throws PackProblem for an archive that is too big, broken or unsafe.
 */
export function readPackArchive(compressed: Buffer): Array<IPackFile> {
    const archive = unpack(compressed);
    const entries = new Array<{ path: string; bytes: Buffer }>();
    let offset = 0;
    let longName: string | null = null;

    while (offset + BLOCK <= archive.length) {
        const header = archive.subarray(offset, offset + BLOCK);

        if (header.every((byte) => byte === 0)) {
            break;
        }

        verifyChecksum(header);

        const size = readSize(header);
        const type = String.fromCharCode(header[156] || 48);
        const start = offset + BLOCK;
        const end = start + size;

        if (end > archive.length) {
            throw new PackProblem('unsafe', 'The archive of this pack is cut off.');
        }

        offset = start + Math.ceil(size / BLOCK) * BLOCK;

        if (type === 'g') {
            continue;
        }

        if (type === 'x') {
            longName = readPaxPath(archive.subarray(start, end)) ?? longName;
            continue;
        }

        if (type === 'L') {
            longName = readText(archive.subarray(start, end));
            continue;
        }

        const path = longName ?? readHeaderPath(header);

        longName = null;
        checkPath(path);

        if (type === '5') {
            continue;
        }

        if (type !== '0' && type !== '7') {
            throw new PackProblem('unsafe', `This pack holds a link or a special file, which Wortlaut refuses: ${path}`);
        }

        if (size > PACK_LIMITS.maxFileBytes) {
            throw new PackProblem('too-large', `The file ${path} of this pack is larger than ${PACK_LIMITS.maxFileBytes} bytes.`);
        }

        entries.push({ path, bytes: Buffer.from(archive.subarray(start, end)) });

        if (entries.length > PACK_LIMITS.maxFiles) {
            throw new PackProblem('too-large', `This pack holds more than ${PACK_LIMITS.maxFiles} files.`);
        }
    }

    return stripTopFolder(entries);
}

/**
 * @private
 */
function unpack(compressed: Buffer): Buffer {
    try {
        return gunzipSync(compressed, { maxOutputLength: PACK_LIMITS.maxUnpackedBytes });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
            throw new PackProblem('too-large', `The archive of this pack unpacks to more than ${PACK_LIMITS.maxUnpackedBytes} bytes.`);
        }

        throw new PackProblem('unsafe', 'The archive of this pack cannot be read.');
    }
}

/**
 * @private
 */
function verifyChecksum(header: Buffer): void {
    const stored = Number.parseInt(readText(header.subarray(148, 156)).trim(), 8);
    let sum = 0;

    for (let index = 0; index < BLOCK; index++) {
        sum += index >= 148 && index < 156 ? 32 : header[index];
    }

    if (stored !== sum) {
        throw new PackProblem('unsafe', 'The archive of this pack is damaged.');
    }
}

/**
 * Reads the size as an octal number. The binary form only serves files far bigger than any pack.
 *
 * @private
 */
function readSize(header: Buffer): number {
    const text = readText(header.subarray(124, 136)).trim();

    if (!(/^[0-7]*$/).test(text)) {
        throw new PackProblem('unsafe', 'The archive of this pack names an impossible file size.');
    }

    return text ? Number.parseInt(text, 8) : 0;
}

/**
 * @private
 */
function readHeaderPath(header: Buffer): string {
    const name = readText(header.subarray(0, 100));
    const prefix = header.subarray(257, 262).toString('latin1') === 'ustar' ? readText(header.subarray(345, 500)) : '';

    return prefix ? `${prefix}/${name}` : name;
}

/**
 * @private
 */
function readPaxPath(body: Buffer): string | null {
    let offset = 0;

    while (offset < body.length) {
        const space = body.indexOf(32, offset);
        const length = Number.parseInt(body.toString('utf8', offset, space), 10);

        if (space < 0 || !Number.isInteger(length) || length <= 0 || offset + length > body.length) {
            throw new PackProblem('unsafe', 'The archive of this pack is damaged.');
        }

        const record = body.toString('utf8', space + 1, offset + length - 1);

        if (record.startsWith('path=')) {
            return record.slice('path='.length);
        }

        offset += length;
    }

    return null;
}

/**
 * @private
 */
function readText(bytes: Buffer): string {
    const end = bytes.indexOf(0);

    return bytes.toString('utf8', 0, end < 0 ? bytes.length : end);
}

/**
 * Refuses a path that could leave the pack, whatever becomes of it later.
 *
 * @private
 */
function checkPath(path: string): void {
    const segments = path.split('/');
    const isUnsafe = path.length === 0 ||
        path.includes('\\') ||
        path.includes('\0') ||
        path.startsWith('/') ||
        (/^[A-Za-z]:/).test(path) ||
        segments.includes('..');

    if (isUnsafe) {
        throw new PackProblem('unsafe', `This pack holds a path that leaves the pack, which Wortlaut refuses: ${path}`);
    }
}

/**
 * Takes away the one folder GitHub and npm put around a pack.
 *
 * @private
 */
function stripTopFolder(entries: ReadonlyArray<{ path: string; bytes: Buffer }>): Array<IPackFile> {
    const tops = new Set(entries.map((entry) => entry.path.split('/')[0]));

    if (tops.size !== 1 || entries.some((entry) => !entry.path.includes('/'))) {
        throw new PackProblem('not-a-pack', 'This archive has no single top folder, so it is no pack.');
    }

    return entries.map((entry) => ({ path: entry.path.slice(entry.path.indexOf('/') + 1), bytes: entry.bytes }));
}
