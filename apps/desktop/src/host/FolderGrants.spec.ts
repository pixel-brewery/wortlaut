// #region Imports

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FolderGrants } from './FolderGrants';

// #endregion

describe('FolderGrants', () => {
  let root: string;
  let grants: FolderGrants;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-grants-')));
    mkdirSync(join(root, 'project', 'i18n'), { recursive: true });
    mkdirSync(join(root, 'other'));
    writeFileSync(join(root, 'file.txt'), '');
    grants = new FolderGrants(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('hands out a token and a display path, never the path itself', () => {
    const selection = grants.grant(join(root, 'project'));

    expect(selection.displayPath).toBe('~/project');
    expect(selection.name).toBe('project');
    expect(selection.token).not.toContain(root);
    expect(grants.resolve(selection.token)).toBe(join(root, 'project'));
  });

  it('refuses a file and a folder that does not exist', () => {
    expect(() => grants.grant(join(root, 'file.txt'))).toThrow('That is a file. Choose a folder.');
    expect(() => grants.grant(join(root, 'nope'))).toThrow('This folder cannot be read.');
  });

  it('refuses a token it did not hand out', () => {
    expect(() => grants.resolve('6f1b1c1e-0d3a-4f5e-9a2b-1c2d3e4f5a6b')).toThrow(
      'This folder is no longer available. Choose it again.',
    );
  });

  it('keeps a further folder inside the chosen root', () => {
    const project = grants.grant(join(root, 'project'));
    const inside = grants.grant(join(root, 'project', 'i18n'), project.token);
    const outside = grants.grant(join(root, 'other'));

    expect(grants.resolveInside(inside.token, project.token)).toBe(join(root, 'project', 'i18n'));
    expect(() => grants.grant(join(root, 'other'), project.token)).toThrow(
      'Choose a folder inside the project.',
    );
    expect(() => grants.resolveInside(outside.token, project.token)).toThrow(
      'Choose a folder inside the project.',
    );
  });

  it('sees through a link that leads out of the root', () => {
    const project = grants.grant(join(root, 'project'));

    symlinkSync(join(root, 'other'), join(root, 'project', 'escape'));

    expect(() => grants.grant(join(root, 'project', 'escape'), project.token)).toThrow(
      'Choose a folder inside the project.',
    );
  });

  it('forgets the oldest grant beyond its bound', () => {
    const first = grants.grant(join(root, 'project'));

    for (let index = 0; index < 256; index++) {
      grants.grant(join(root, 'other'));
    }

    expect(() => grants.resolve(first.token)).toThrow('This folder is no longer available.');
  });
});
