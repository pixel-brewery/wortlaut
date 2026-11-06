// #region Imports

import { describe, expect, it } from 'vitest';
import { WorkspaceColorSchema, WorkspaceFileSchema } from './WorkspaceRecord.js';

// #endregion

describe('WorkspaceColorSchema', () => {
  it.each(['teal', 'blue', 'violet', 'orange', 'green'])(
    'keeps the legacy %s profile color readable',
    (color) => {
      expect(WorkspaceColorSchema.parse(color)).toBe(color);
    },
  );

  it('normalizes a custom opaque RGB color through a saved profile round trip', () => {
    const profile = WorkspaceFileSchema.parse({
      schemaVersion: 1,
      workspaces: [
        {
          id: 'workspace-custom',
          name: 'Custom identity',
          code: 'CI',
          color: '#a1b2c3',
          repositories: ['/fixture/repository'],
          scanForProjects: true,
          defaults: { baseLocale: null, targetLocales: [], preset: null },
          projects: [],
          createdAt: '2026-01-01T12:00:00.000Z',
          openedAt: null,
        },
      ],
    });

    const reopened = WorkspaceFileSchema.parse(JSON.parse(JSON.stringify(profile)));

    expect(reopened.workspaces[0].color).toBe('#A1B2C3');
  });

  it.each([
    '#abc',
    '#11223344',
    'rgba(1, 2, 3, 0.5)',
    'url(https://example.invalid)',
    '#12345g',
    ' #123456',
  ])('rejects unsupported workspace color %s', (color) => {
    expect(WorkspaceColorSchema.safeParse(color).success).toBe(false);
  });
});
