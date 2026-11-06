// #region Imports

import { gzipSync } from 'node:zlib';
import type { RulePackManifest } from '@pixel-brewery/wortlaut-contracts';
import type { IPackFile } from '../PackArchive';
import type { INpmPackage, IPackFetcher } from '../PackFetcher';
import { PackProblem } from '../PackProblem';

// #endregion

/**
 * An entry of a tar archive for a spec.
 *
 * @internal
 */
export interface ITarEntry {
  path: string;
  content?: string | Buffer;

  /**
   * The type flag: `0` a file, `2` a symbolic link, `1` a hard link, `5` a folder.
   */
  type?: string;
  size?: number;
}

/**
 * Builds a tar archive by hand, because a spec has to name what no packing tool would write.
 *
 * @internal
 * @param entries The entries.
 * @returns The archive, without compression.
 */
export function createTar(entries: ReadonlyArray<ITarEntry>): Buffer {
  const blocks = new Array<Buffer>();

  for (const entry of entries) {
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content ?? '', 'utf8');
    const header = Buffer.alloc(512);

    header.write(entry.path.slice(0, 100), 0, 'utf8');
    header.write('0000644\0', 100, 'latin1');
    header.write('0000000\0', 108, 'latin1');
    header.write('0000000\0', 116, 'latin1');
    header.write(
      `${(entry.size ?? content.length).toString(8).padStart(11, '0')}\0`,
      124,
      'latin1',
    );
    header.write('00000000000\0', 136, 'latin1');
    header.write('        ', 148, 'latin1');
    header.write(entry.type ?? '0', 156, 'latin1');
    header.write('ustar\0', 257, 'latin1');
    header.write('00', 263, 'latin1');

    let sum = 0;

    for (const byte of header) {
      sum += byte;
    }

    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'latin1');
    blocks.push(header, content, Buffer.alloc((512 - (content.length % 512)) % 512));
  }

  blocks.push(Buffer.alloc(1024));

  return Buffer.concat(blocks);
}

/**
 * Builds the `.tar.gz` of a pack.
 *
 * @internal
 * @param entries The entries.
 * @returns The compressed archive.
 */
export function createTarball(entries: ReadonlyArray<ITarEntry>): Buffer {
  return gzipSync(createTar(entries));
}

/**
 * A definition file for a spec, with a pattern, a limit and a named check.
 *
 * @internal
 * @param overrides What differs.
 * @returns The definition.
 */
export function createManifest(overrides: Partial<RulePackManifest> = {}): RulePackManifest {
  return {
    schemaVersion: 1,
    id: 'our-pack',
    name: 'Our pack',
    description: 'Our own rules.',
    version: '1.0.0',
    rules: [
      {
        id: 'no-todo',
        description: 'No TODO in a value.',
        severity: 'error',
        title: '{count} values hold TODO',
        message: 'Remove TODO.',
        column: 'Value',
        pattern: { regex: 'TODO' },
      },
      {
        id: 'short-values',
        description: 'Values stay short.',
        severity: 'warning',
        message: 'Too long.',
        limit: { maxLength: 30 },
      },
      {
        id: 'same-placeholders',
        description: 'Placeholders match.',
        severity: 'error',
        message: 'Placeholders differ.',
        check: { name: 'placeholder-comparison' },
      },
    ],
    ...overrides,
  };
}

/**
 * Writes a definition the way a pack holds it.
 *
 * @internal
 * @param manifest The definition.
 * @returns The text of the file.
 */
export function printManifest(manifest: RulePackManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * A source of packs in memory, which counts how often it is asked.
 *
 * @internal
 */
export class FakePackFetcher implements IPackFetcher {
  // #region Fields

  public commit = 'a'.repeat(40);
  public files: Array<IPackFile> = [];
  public version = '1.0.0';
  public failure: PackProblem | null = null;
  public downloads = 0;

  // #endregion

  // #region Methods

  /**
   * Sets what the source holds.
   *
   * @param manifest The definition.
   * @param commit The commit it is at.
   */
  public hold(manifest: RulePackManifest, commit: string = this.commit): void {
    this.commit = commit;
    this.files = [
      { path: 'wortlaut-pack.json', bytes: Buffer.from(printManifest(manifest), 'utf8') },
    ];
  }

  /**
   * @override
   */
  public resolveCommit(): Promise<string> {
    return this.failure ? Promise.reject(this.failure) : Promise.resolve(this.commit);
  }

  /**
   * @override
   */
  public downloadCommit(): Promise<Array<IPackFile>> {
    this.downloads++;

    return this.failure ? Promise.reject(this.failure) : Promise.resolve(this.files);
  }

  /**
   * @override
   */
  public resolvePackage(): Promise<INpmPackage> {
    return this.failure
      ? Promise.reject(this.failure)
      : Promise.resolve({
          version: this.version,
          tarball: 'https://registry.npmjs.org/x.tgz',
          integrity: null,
          shasum: null,
        });
  }

  /**
   * @override
   */
  public downloadPackage(): Promise<Array<IPackFile>> {
    this.downloads++;

    return this.failure ? Promise.reject(this.failure) : Promise.resolve(this.files);
  }

  // #endregion
}
