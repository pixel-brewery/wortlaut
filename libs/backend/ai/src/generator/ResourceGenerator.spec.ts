// #region Imports

import type {
  IResourceInfo,
  IResourceModel,
  ResourceReader,
  ResourceTransformer,
} from '@pixel-brewery/wortlaut-core';
import type { IFileSystem, ILogger } from '@pixel-brewery/utilities';
import { describe, expect, it, vi } from 'vitest';
import type { IResourceGeneratorOptions } from './interfaces/IResourceGeneratorOptions';
import { ResourceGenerator } from './ResourceGenerator';
import type { IResourceGeneratorStrategy } from './strategies/interfaces/IResourceGeneratorStrategy';

// #endregion

describe('ResourceGenerator', () => {
  it('translates only the keys the target lacks and keeps the ones it has', async () => {
    // arrange
    const { generator, transcribe, serialize } = createGenerator({ targetExists: true });

    // act
    await generator.run(createResource('en'), ['de'], 'test', true);

    // assert
    expect(transcribe).toHaveBeenCalledOnce();
    expect(transcribe.mock.calls[0][0].models.map((x: IResourceModel) => x.key)).toEqual(['b']);
    expect(serialize.mock.calls[0][0].map((x: IResourceModel) => [x.key, x.value])).toEqual([
      ['a', 'A de'],
      ['b', 'B translated'],
    ]);
  });

  it('translates every key when the target does not exist yet', async () => {
    // arrange
    const { generator, transcribe } = createGenerator({ targetExists: false });

    // act
    await generator.run(createResource('en'), ['de'], 'test', true);

    // assert
    expect(transcribe.mock.calls[0][0].models.map((x: IResourceModel) => x.key)).toEqual([
      'a',
      'b',
    ]);
  });

  it('translates every key without the flag', async () => {
    // arrange
    const { generator, transcribe } = createGenerator({ targetExists: true });

    // act
    await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(transcribe.mock.calls[0][0].models.map((x: IResourceModel) => x.key)).toEqual([
      'a',
      'b',
    ]);
  });

  it('proposes the whole target without writing a file', async () => {
    // arrange
    const { generator, fileSystem } = createGenerator({ targetExists: true });

    // act
    const run = await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(run.status).toBe('completed');
    expect(
      run.results.map((result) => [result.locale, result.status, result.translatedKeys]),
    ).toEqual([['de', 'completed', 2]]);
    expect(fileSystem.fileWriteAllText).not.toHaveBeenCalled();
    expect(fileSystem.fileWriteAllJson).not.toHaveBeenCalled();
  });

  it('keeps what a failed run finished as a proposal and writes nothing', async () => {
    // arrange
    const { generator, fileSystem, transcribe, serialize } = createGenerator({
      targetExists: true,
      chunkSize: 1,
    });
    const providerError = new Error('quota exceeded');

    transcribe.mockResolvedValueOnce([{ key: 'a', value: 'A translated', comment: '' }] as never);
    transcribe.mockRejectedValueOnce(providerError);

    // act
    const run = await generator.run(createResource('en'), ['de', 'fr'], 'test');

    // assert
    expect(run.status).toBe('failed');
    expect(run.error).toBe(providerError);
    expect(
      run.results.map((result) => [result.locale, result.status, result.translatedKeys]),
    ).toEqual([['de', 'failed', 1]]);
    expect(serialize.mock.calls[0][0].map((x: IResourceModel) => [x.key, x.value])).toEqual([
      ['a', 'A translated'],
    ]);
    expect(fileSystem.fileWriteAllText).not.toHaveBeenCalled();
  });

  it('proposes nothing for a locale whose first chunk fails', async () => {
    // arrange
    const { generator, transcribe } = createGenerator({ targetExists: false });

    transcribe.mockRejectedValueOnce(new Error('offline'));

    // act
    const run = await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(run.status).toBe('failed');
    expect(run.results).toEqual([]);
  });

  it('starts no new chunk once it is stopped and keeps what was finished', async () => {
    // arrange
    const stop = new AbortController();
    const { generator, transcribe } = createGenerator({
      targetExists: false,
      chunkSize: 1,
      signal: stop.signal,
    });

    transcribe.mockImplementationOnce((input: { models: Array<IResourceModel> }) => {
      stop.abort();

      return Promise.resolve(input.models);
    });

    // act
    const run = await generator.run(createResource('en'), ['de', 'fr'], 'test');

    // assert
    expect(transcribe).toHaveBeenCalledOnce();
    expect(run.status).toBe('stopped');
    expect(run.results.map((result) => [result.locale, result.status])).toEqual([
      ['de', 'stopped'],
    ]);
  });

  it('counts a cancelled chunk as a stop and not as a failure', async () => {
    // arrange
    const stop = new AbortController();
    const { generator, transcribe } = createGenerator({ targetExists: false, signal: stop.signal });

    transcribe.mockImplementationOnce(() => {
      stop.abort();

      return Promise.reject(new Error('aborted'));
    });

    // act
    const run = await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(run.status).toBe('stopped');
    expect(run.error).toBeNull();
  });

  it('translates the missing scope: keys the target lacks or holds identical, minus the exceptions', async () => {
    // arrange
    const { generator, transcribe } = createGenerator({
      targetExists: true,
      scope: 'missing',
      source: [
        ['same', 'Same'],
        ['kept', 'Kept'],
        ['absent', 'Absent'],
        ['brand', 'Brand'],
        ['loc.name', 'Name'],
      ],
      target: [
        ['same', 'Same'],
        ['kept', 'Behalten'],
        ['brand', 'Brand'],
        ['loc.name', 'Name'],
      ],
      identicalValues: ['Brand'],
      identicalKeys: ['loc.*'],
    });

    // act
    await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(transcribe.mock.calls[0][0].models.map((x: IResourceModel) => x.key)).toEqual([
      'same',
      'absent',
    ]);
  });

  it('translates a namespace and keeps the other keys of the target', async () => {
    // arrange
    const { generator, transcribe, serialize } = createGenerator({
      targetExists: true,
      namespace: 'loc.orders',
      source: [
        ['loc.orders.open', 'Open'],
        ['loc.ordersx', 'Other'],
        ['loc.other', 'Other'],
      ],
      target: [['loc.other', 'Andere']],
    });

    // act
    await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(transcribe.mock.calls[0][0].models.map((x: IResourceModel) => x.key)).toEqual([
      'loc.orders.open',
    ]);
    expect(serialize.mock.calls[0][0].map((x: IResourceModel) => x.key)).toEqual([
      'loc.other',
      'loc.orders.open',
    ]);
  });

  it('reports a chunk that returns the wrong number of models', async () => {
    // arrange
    const { generator, transcribe } = createGenerator({ targetExists: false });

    transcribe.mockResolvedValueOnce([] as never);

    // act
    const run = await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(run.results[0].warnings.join(' ')).toContain('It returned 0 rows for 2 keys.');
  });

  it('never proposes a chunk that stays wrong, and fails the run instead', async () => {
    // arrange
    const { generator, transcribe, serialize } = createGenerator({
      targetExists: false,
      chunkSize: 1,
      retryDelayMs: 0,
    });

    transcribe.mockResolvedValueOnce([{ key: 'a', value: 'A de', comment: '' }] as never);
    transcribe.mockResolvedValue([{ key: 'changed', value: 'B de', comment: '' }] as never);

    // act
    const run = await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(run.status).toBe('failed');
    expect(transcribe).toHaveBeenCalledTimes(4);
    expect(serialize.mock.calls[0][0].map((x: IResourceModel) => x.key)).toEqual(['a']);
  });

  it('holds back a value whose placeholders stay wrong', async () => {
    // arrange
    const { generator, transcribe, serialize } = createGenerator({
      targetExists: false,
      source: [['a', 'Hello {0}']],
    });

    transcribe.mockResolvedValue([{ key: 'a', value: 'Hallo', comment: '' }] as never);

    // act
    const run = await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(transcribe).toHaveBeenCalledTimes(3);
    expect(run.results[0].heldBack).toEqual(['a']);
    expect(serialize.mock.calls[0][0]).toEqual([]);
  });

  it('applies the limit after the namespace, unless the legacy flag asks for the old order', async () => {
    // arrange
    const source: Array<[string, string]> = [
      ['a.x', '1'],
      ['b.x', '2'],
      ['b.y', '3'],
    ];
    const { generator, transcribe } = createGenerator({
      targetExists: false,
      source,
      namespace: 'b',
      limit: 1,
      target: [],
    });

    // act
    await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(transcribe.mock.calls[0][0].models.map((x: IResourceModel) => x.key)).toEqual(['b.x']);
  });

  it.each(['x/../../../.claude/settings', '..', 'a\\b'])(
    'refuses the locale %s, which would name a file elsewhere',
    (locale) => {
      // arrange
      const { generator } = createGenerator({ targetExists: false });

      // act & assert
      expect(() => generator.getTargetFilePath(createResource('en'), locale)).toThrow(
        /holds a path/,
      );
    },
  );

  it('translates only the keys it is told to, and sends comments and instructions apart', async () => {
    // arrange
    const { generator, transcribe } = createGenerator({
      targetExists: false,
      keys: ['b'],
      commentOf: () => 'A button',
      localeInstructions: { de: 'Use du.' },
      config: { apiKey: '', model: '', temperature: 0, instructions: 'Keep Wortlaut.' },
    });

    // act
    await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(transcribe.mock.calls[0][0].models).toEqual([
      { key: 'b', value: 'B', comment: 'A button' },
    ]);
    expect(transcribe.mock.calls[0][2]).toMatchObject({
      instructions: ['Keep Wortlaut.', 'Use du.'],
    });
  });

  it('reports progress per chunk, without touching the terminal itself', async () => {
    // arrange
    const onProgress = vi.fn();
    const stdout = vi.spyOn(process.stdout, 'write');
    const { generator } = createGenerator({ targetExists: false, chunkSize: 1, onProgress });

    // act
    await generator.run(createResource('en'), ['de'], 'test');

    // assert
    expect(
      onProgress.mock.calls.map(([progress]) => [progress.completedChunks, progress.totalChunks]),
    ).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    expect(stdout).not.toHaveBeenCalled();

    stdout.mockRestore();
  });

  it('reads the target as a file, because a directory scan of a file path finds nothing', async () => {
    // arrange
    const { generator, reader } = createGenerator({ targetExists: true });

    // act
    await generator.run(createResource('en'), ['de'], 'test', true);

    // assert
    expect(reader.scanFile).toHaveBeenCalledWith(
      expect.stringContaining('lang.en.de.json'),
      'json',
    );
  });

  it('still throws for a strategy that does not exist', async () => {
    // arrange
    const { generator } = createGenerator({ targetExists: false });

    // act & assert
    await expect(generator.run(createResource('en'), ['de'], 'nope')).rejects.toThrow(
      'not supported',
    );
  });
});

function createResource(locale: string): IResourceInfo {
  return {
    locale,
    name: `lang.${locale}.json`,
    path: `i18n/lang.${locale}.json`,
    type: 'json',
  } as unknown as IResourceInfo;
}

function createGenerator(
  options: Partial<IResourceGeneratorOptions> & {
    targetExists: boolean;
    source?: Array<[string, string]>;
    target?: Array<[string, string]>;
  },
) {
  const models = (entries: Array<[string, string]>): Array<IResourceModel> =>
    entries.map(([key, value]) => ({ key, value })) as unknown as Array<IResourceModel>;
  const source = models(
    options.source ?? [
      ['a', 'A'],
      ['b', 'B'],
    ],
  );
  const target = models(options.target ?? [['a', 'A de']]);
  const targetResource = createResource('de');
  const transcribe = vi.fn(
    (input: { models: Array<IResourceModel> }, _locale?: string, _options?: unknown) =>
      Promise.resolve(input.models.map((x) => ({ ...x, value: `${String(x.value)} translated` }))),
  );
  const serialize = vi.fn((_models: Array<IResourceModel>, meta: Record<string, unknown>) => ({
    ...meta,
    toString: () => '',
  }));
  const transformer = {
    transform: vi.fn((resource: IResourceInfo) => (resource === targetResource ? target : source)),
    serialize,
  } as unknown as ResourceTransformer;
  const reader = { scanFile: vi.fn(() => targetResource) } as unknown as ResourceReader;
  const fileSystem = {
    fileExists: vi.fn(() => options.targetExists),
    fileWriteAllText: vi.fn(),
    fileWriteAllJson: vi.fn(),
    pathGetFileName: vi.fn(() => 'lang.de.json'),
    pathGetFileNameWithoutExtension: vi.fn(() => 'lang.en'),
    pathGetDirectoryName: vi.fn(() => 'i18n'),
    pathGetExtension: vi.fn(() => '.json'),
  } as unknown as IFileSystem;
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger;
  const generator = new ResourceGenerator(logger, fileSystem, transformer, reader, {
    chunkSize: 10,
    limit: null,
    config: { apiKey: 'test', model: 'test', temperature: 0, instructions: '' },
    ...options,
  });

  generator.registerStrategy('test', { transcribe } as unknown as IResourceGeneratorStrategy);

  return { generator, transcribe, serialize, fileSystem, reader };
}
