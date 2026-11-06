// #region Imports

import { describe, expect, it, vi } from 'vitest';
import type { IResourceGeneratorStrategy } from './strategies/interfaces/IResourceGeneratorStrategy';
import { runTranslation, type ITranslationGate } from './TranslationRunner';

// #endregion

const CHUNKS = [
  [{ key: 'a', value: 'A', comment: '' }],
  [{ key: 'b', value: 'B', comment: '' }],
  [{ key: 'c', value: 'C', comment: '' }],
];
const BASE = {
  resource: { type: 'json', locale: 'en' },
  locale: 'de',
  chunks: CHUNKS,
  retryBudget: 0,
};

/**
 * @private
 */
function echo(): ReturnType<typeof vi.fn> {
  return vi.fn((data: { models: Array<{ key: string; value: string }> }) =>
    Promise.resolve(data.models.map((model) => ({ ...model, value: `${model.value} de` }))),
  );
}

describe('runTranslation', () => {
  it('reports every chunk and ends completed', async () => {
    // arrange
    const transcribe = echo();
    const ended = new Array<number>();

    // act
    const outcome = await runTranslation({
      ...BASE,
      strategy: { transcribe } as unknown as IResourceGeneratorStrategy,
      onChunkEnd: (index) => ended.push(index),
    });

    // assert
    expect(outcome.status).toBe('completed');
    expect(outcome.rows.map((row) => row.value)).toEqual(['A de', 'B de', 'C de']);
    expect(ended).toEqual([0, 1, 2]);
  });

  it('starts no new chunk while the gate holds it, and goes on when it opens', async () => {
    // arrange
    const transcribe = echo();
    const opened = new Array<() => void>();
    const gate: ITranslationGate = {
      waitForTurn: () =>
        transcribe.mock.calls.length === 1
          ? new Promise((resolve) => opened.push(resolve))
          : Promise.resolve(),
      afterFailure: () => Promise.resolve('stop'),
    };

    // act
    const run = runTranslation({
      ...BASE,
      strategy: { transcribe } as unknown as IResourceGeneratorStrategy,
      gate,
    });

    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(transcribe).toHaveBeenCalledTimes(1);
    opened[0]();

    // assert
    await expect(run).resolves.toMatchObject({ status: 'completed', finishedChunks: 3 });
  });

  it('asks the failed chunk again when the gate says resume, and starts no chunk twice', async () => {
    // arrange
    const transcribe = echo();

    transcribe.mockImplementationOnce((data: { models: Array<{ key: string; value: string }> }) =>
      Promise.resolve(data.models.map((model) => ({ ...model, value: `${model.value} de` }))),
    );
    transcribe.mockRejectedValueOnce(new Error('provider down'));

    const afterFailure = vi.fn(() => Promise.resolve('retry' as const));

    // act
    const outcome = await runTranslation({
      ...BASE,
      strategy: { transcribe } as unknown as IResourceGeneratorStrategy,
      gate: { waitForTurn: () => Promise.resolve(), afterFailure },
    });

    // assert
    expect(afterFailure).toHaveBeenCalledWith(1, expect.any(Error));
    expect(outcome.status).toBe('completed');
    expect(outcome.rows.map((row) => row.key)).toEqual(['a', 'b', 'c']);
    expect(transcribe.mock.calls.map(([data]) => data.models[0].key)).toEqual(['a', 'b', 'b', 'c']);
  });

  it('ends at the first failure without a gate, with what was finished', async () => {
    // arrange
    const transcribe = echo();

    transcribe.mockImplementationOnce((data: { models: Array<{ key: string; value: string }> }) =>
      Promise.resolve(data.models.map((model) => ({ ...model, value: 'x' }))),
    );
    transcribe.mockRejectedValueOnce(new Error('provider down'));

    // act
    const outcome = await runTranslation({
      ...BASE,
      strategy: { transcribe } as unknown as IResourceGeneratorStrategy,
    });

    // assert
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.message).toBe('provider down');
    expect(outcome.rows.map((row) => row.key)).toEqual(['a']);
  });

  it('ends stopped without a new chunk once the signal fired', async () => {
    // arrange
    const controller = new AbortController();
    const transcribe = vi.fn((data: { models: Array<{ key: string; value: string }> }) => {
      controller.abort();

      return Promise.resolve(data.models);
    });

    // act
    const outcome = await runTranslation({
      ...BASE,
      signal: controller.signal,
      strategy: { transcribe } as unknown as IResourceGeneratorStrategy,
    });

    // assert
    expect(outcome.status).toBe('stopped');
    expect(transcribe).toHaveBeenCalledOnce();
  });
});
