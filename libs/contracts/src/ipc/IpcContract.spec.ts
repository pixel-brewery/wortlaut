// #region Imports

import { describe, expect, it } from 'vitest';
import { IPC_CONTRACT, IpcRequestEnvelopeSchema, IpcResponseEnvelopeSchema } from './IpcContract';
import { IpcEventSchema } from './IpcEvents';

// #endregion

const TOKEN = '6f1b1c1e-0d3a-4f5e-9a2b-1c2d3e4f5a6b';

describe('IPC_CONTRACT', () => {
  it('refuses a path where a folder token belongs', () => {
    expect(
      IPC_CONTRACT['project.inspectFolder'].request.safeParse({
        folderToken: TOKEN,
        catalogFolderTokens: [],
        preset: null,
      }).success,
    ).toBe(true);
    expect(
      IPC_CONTRACT['project.inspectFolder'].request.safeParse({
        folderToken: '/etc',
        catalogFolderTokens: [],
        preset: null,
      }).success,
    ).toBe(false);
    expect(
      IPC_CONTRACT['project.inspectFolder'].request.safeParse({
        folderToken: TOKEN,
        catalogFolderTokens: ['/etc'],
        preset: null,
      }).success,
    ).toBe(false);
    expect(
      IPC_CONTRACT['workspace.create'].request.safeParse({
        name: 'Acme',
        code: 'AC',
        color: 'teal',
        folderToken: '/work/me/code',
      }).success,
    ).toBe(false);
  });

  it('refuses a payload that smuggles an extra path', () => {
    expect(
      IPC_CONTRACT['project.inspectFolder'].request.safeParse({
        folderToken: TOKEN,
        catalogFolderTokens: [],
        preset: null,
        path: '/etc',
      }).success,
    ).toBe(false);
    expect(
      IPC_CONTRACT['project.summary'].request.safeParse({ projectId: 'a', file: '/etc/passwd' })
        .success,
    ).toBe(false);
  });

  it('accepts source root selection tokens for inspection and registration while refusing paths', () => {
    const inspect = { folderToken: TOKEN, catalogFolderTokens: [], preset: 'angular' };
    const register = {
      ...inspect,
      workspace: { kind: 'new', name: 'Shop', code: 'SH', color: 'teal' },
      baseLocale: 'en',
      targetLocales: ['de'],
    };

    for (const [schema, request] of [
      [IPC_CONTRACT['project.inspectFolder'].request, inspect],
      [IPC_CONTRACT['project.register'].request, register],
    ] as const) {
      expect(schema.safeParse({ ...request, sourceRootToken: TOKEN }).success).toBe(true);
      expect(schema.safeParse({ ...request, sourceRootToken: null }).success).toBe(true);
      expect(schema.safeParse(request).success).toBe(true);
      expect(schema.safeParse({ ...request, sourceRootToken: '/etc' }).success).toBe(false);
      expect(schema.safeParse({ ...request, sourceRoot: '../backend' }).success).toBe(false);
    }
  });

  it('names the folder of a rule pack only by a token', () => {
    const check = IPC_CONTRACT['rulePack.check'].request;

    expect(check.safeParse({ source: { kind: 'folder', folderToken: TOKEN } }).success).toBe(true);
    expect(check.safeParse({ source: { kind: 'folder', folderToken: '/etc' } }).success).toBe(
      false,
    );
    expect(check.safeParse({ source: { kind: 'folder', path: '/etc' } }).success).toBe(false);
    expect(
      check.safeParse({
        source: { kind: 'github', value: 'github:owner/repository', path: '/etc' },
      }).success,
    ).toBe(false);
    expect(
      IPC_CONTRACT['rulePack.setSeverity'].request.safeParse({
        workspaceId: 'a',
        ruleId: '../evil',
        severity: 'off',
      }).success,
    ).toBe(false);
    expect(
      IPC_CONTRACT['rulePack.setSeverity'].request.safeParse({
        workspaceId: 'a',
        ruleId: 'a-rule',
        severity: 'loud',
      }).success,
    ).toBe(false);
  });

  it('refuses ids that could leave a directory', () => {
    expect(IPC_CONTRACT['run.get'].request.safeParse({ runId: '../../etc/passwd' }).success).toBe(
      false,
    );
    expect(IPC_CONTRACT['project.summary'].request.safeParse({ projectId: 'a/b' }).success).toBe(
      false,
    );
  });

  it('accepts the registration of a project with a new workspace', () => {
    const request = {
      folderToken: TOKEN,
      catalogFolderTokens: [],
      workspace: { kind: 'new', name: 'Acme', code: 'AC', color: 'teal' },
      preset: 'angular',
      baseLocale: 'en',
      targetLocales: ['de', 'pt-BR'],
    };

    expect(IPC_CONTRACT['project.register'].request.safeParse(request).success).toBe(true);
    expect(
      IPC_CONTRACT['project.register'].request.safeParse({ ...request, baseLocale: '../x' })
        .success,
    ).toBe(false);
    expect(
      IPC_CONTRACT['project.register'].request.safeParse({ ...request, preset: 'jquery' }).success,
    ).toBe(false);
  });
});

describe('IpcRequestEnvelopeSchema', () => {
  it('accepts only known methods', () => {
    expect(
      IpcRequestEnvelopeSchema.safeParse({ correlationId: TOKEN, method: 'run.list', payload: {} })
        .success,
    ).toBe(true);
    expect(
      IpcRequestEnvelopeSchema.safeParse({
        correlationId: TOKEN,
        method: 'fs.readFile',
        payload: {},
      }).success,
    ).toBe(false);
  });
});

describe('IpcResponseEnvelopeSchema', () => {
  it('bounds the message of a failure', () => {
    const failure = {
      correlationId: TOKEN,
      ok: false,
      error: { code: 'x', message: 'y'.repeat(2001) },
    };

    expect(IpcResponseEnvelopeSchema.safeParse(failure).success).toBe(false);
  });
});

describe('IpcEventSchema', () => {
  it('refuses an event that names a path instead of a token', () => {
    expect(
      IpcEventSchema.safeParse({
        type: 'folder.dropped',
        folder: { token: '/etc', displayPath: '/etc', name: 'etc' },
      }).success,
    ).toBe(false);
    expect(
      IpcEventSchema.safeParse({
        type: 'folder.dropped',
        folder: { token: TOKEN, displayPath: '~/x', name: 'x' },
      }).success,
    ).toBe(true);
  });

  it('has one way for a key to cross, inward, and none outward', () => {
    // arrange
    const input = {
      locales: ['de'],
      scope: 'all',
      namespace: null,
      keys: null,
      limit: null,
      provider: 'openai',
      model: 'm',
      temperature: 0.3,
      chunkSize: 10,
      instructions: '',
      reviewBeforeWriting: true,
      protectPlaceholders: true,
    };
    const provider = { id: 'openai', name: 'OpenAI', kind: 'key', state: 'ready', description: '' };

    // act & assert
    expect(
      IPC_CONTRACT['ai.setKey'].request.safeParse({
        providerId: 'openai',
        key: 'test-key-not-real',
      }).success,
    ).toBe(true);
    expect(
      IPC_CONTRACT['run.start'].request.safeParse({ command: 'generate', projectId: 'p1', input })
        .success,
    ).toBe(true);
    expect(
      IPC_CONTRACT['run.start'].request.safeParse({
        command: 'generate',
        projectId: 'p1',
        input: { ...input, apiKey: 'test-key-not-real' },
      }).success,
    ).toBe(false);
    expect(IPC_CONTRACT['ai.providers'].response.safeParse([provider]).success).toBe(true);
    expect(
      IPC_CONTRACT['ai.providers'].response.safeParse([{ ...provider, key: 'test-key-not-real' }])
        .success,
    ).toBe(false);
  });

  it('keeps a chunk and a temperature within their bounds', () => {
    // arrange
    const input = {
      locales: ['de'],
      scope: 'all',
      namespace: null,
      keys: null,
      limit: null,
      provider: 'openai',
      model: 'm',
      temperature: 0.3,
      chunkSize: 10,
      instructions: '',
      reviewBeforeWriting: true,
      protectPlaceholders: true,
    };
    const start = (change: object): boolean =>
      IPC_CONTRACT['run.start'].request.safeParse({
        command: 'generate',
        projectId: 'p1',
        input: { ...input, ...change },
      }).success;

    // act & assert
    expect(start({ chunkSize: 0 })).toBe(false);
    expect(start({ chunkSize: 101 })).toBe(false);
    expect(start({ temperature: 1.1 })).toBe(false);
    expect(start({ locales: [] })).toBe(false);
    expect(start({ locales: ['../etc'] })).toBe(false);
  });
});
