// #region Imports

import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IFileSystem } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { translateChunk } from '../generator/ChunkTranslator';
import { ChatGptResourceGeneratorStrategy } from '../generator/strategies/ChatGptResourceGeneratorStrategy';
import { GeminiResourceGeneratorStrategy } from '../generator/strategies/GeminiResourceGeneratorStrategy';
import { knownModels, listModels, testKey } from './KeyProviders';

// #endregion

/**
 * An obvious test value: no real provider is ever called from a spec.
 */
const KEY = 'test-key-not-real';

describe('the API key providers, against a fake server', () => {
  let server: Server;
  let baseUrl: string;
  const seen = new Array<{ url: string; headers: IncomingHttpHeaders; body: string }>();
  let respond: (url: string) => { status: number; body: unknown };

  beforeEach(async () => {
    seen.length = 0;
    server = createServer((request, response) => {
      let body = '';

      request.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      request.on('end', () => {
        seen.push({ url: request.url ?? '', headers: request.headers, body });

        const { status, body: answer } = respond(request.url ?? '');

        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(answer));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  });

  afterEach(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  /**
   * The answer of an OpenAI Responses endpoint with a JSON text.
   */
  function openAiAnswer(rows: unknown): unknown {
    return {
      id: 'resp_1',
      created_at: 1,
      model: 'gpt-4o-mini',
      output: [
        {
          id: 'm1',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: JSON.stringify({ elements: rows }), annotations: [] },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    };
  }

  it('sends instructions and catalog text apart, and checks what comes back', async () => {
    // arrange
    respond = () => ({
      status: 200,
      body: openAiAnswer([{ key: 'loc.a', value: 'Bonjour {0}', comment: '' }]),
    });

    const strategy = new ChatGptResourceGeneratorStrategy({} as IFileSystem, {
      apiKey: KEY,
      model: 'gpt-4o-mini',
      temperature: 0.3,
      instructions: 'Keep Wortlaut.',
      baseUrl,
    });

    // act
    const report = await translateChunk(strategy, {
      resource: { type: 'json', locale: 'en' },
      locale: 'fr',
      models: [{ key: 'loc.a', value: 'Hello {0}', comment: '' }],
      retryBudget: 0,
    });

    // assert
    expect(report.status).toBe('done');
    expect(report.rows[0].value).toBe('Bonjour {0}');
    expect(report.tokens).toBe(15);
    expect(seen[0].headers.authorization).toBe(`Bearer ${KEY}`);

    const input = JSON.parse(seen[0].body).input as Array<{ role: string; content: unknown }>;
    const system = JSON.stringify(
      input.find((entry) => entry.role === 'system' || entry.role === 'developer')?.content,
    );
    const user = JSON.stringify(input.find((entry) => entry.role === 'user')?.content);

    expect(system).toContain('Keep Wortlaut.');
    expect(system).not.toContain('Hello {0}');
    expect(user).toContain('Hello {0}');
    expect(user).not.toContain('Keep Wortlaut.');
  });

  it('fails the chunk with a message that holds no key when the provider refuses', async () => {
    // arrange
    respond = () => ({
      status: 401,
      body: {
        error: {
          message: `Incorrect API key provided: ${KEY}`,
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
    });

    const strategy = new ChatGptResourceGeneratorStrategy({} as IFileSystem, {
      apiKey: KEY,
      model: 'gpt-4o-mini',
      temperature: 0,
      instructions: '',
      baseUrl,
    });

    // act
    const report = await translateChunk(strategy, {
      resource: { type: 'json', locale: 'en' },
      locale: 'fr',
      models: [{ key: 'a', value: 'A', comment: '' }],
      retryBudget: 2,
      retryDelayMs: 0,
    });

    // assert
    expect(report.status).toBe('failed');
    expect(seen).toHaveLength(1);
    expect(report.error?.message).not.toContain(KEY);
    expect(report.error?.message).toContain('Incorrect API key');
  });

  it('sends a Google request with the key in a header, never in the address', async () => {
    // arrange
    respond = () => ({
      status: 200,
      body: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                { text: JSON.stringify({ elements: [{ key: 'a', value: 'Ä', comment: '' }] }) },
              ],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
      },
    });

    const strategy = new GeminiResourceGeneratorStrategy({} as IFileSystem, {
      apiKey: KEY,
      model: 'gemini-2.5-flash',
      temperature: 0,
      instructions: '',
      baseUrl,
    });

    // act
    const report = await translateChunk(strategy, {
      resource: { type: 'json', locale: 'en' },
      locale: 'de',
      models: [{ key: 'a', value: 'A', comment: '' }],
      retryBudget: 0,
    });

    // assert
    expect(report.status).toBe('done');
    expect(seen[0].url).not.toContain(KEY);
    expect(seen[0].headers['x-goog-api-key']).toBe(KEY);
  });

  it('tests a key and says what the provider answered, without the key', async () => {
    // arrange
    respond = () => ({ status: 200, body: { data: [] } });

    // act
    const accepted = await testKey({ provider: 'openai', apiKey: KEY, baseUrl });

    respond = () => ({ status: 401, body: { error: { message: `bad ${KEY}` } } });

    const rejected = await testKey({ provider: 'openai', apiKey: KEY, baseUrl });

    // assert
    expect(accepted).toEqual({ ok: true, message: 'The provider accepted this key.' });
    expect(rejected).toEqual({ ok: false, message: 'The provider rejected this key.' });
    expect(seen[0].url).toBe('/v1/models');
  });

  it('lists the models of a provider, the known ones first, and the known ones when it cannot be asked', async () => {
    // arrange
    respond = () => ({
      status: 200,
      body: { data: [{ id: 'whisper-1' }, { id: 'gpt-5' }, { id: 'gpt-4o-mini' }] },
    });

    // act
    const listed = await listModels({ provider: 'openai', apiKey: KEY, baseUrl });

    respond = () => ({ status: 500, body: {} });

    const fallback = await listModels({ provider: 'openai', apiKey: KEY, baseUrl });

    // assert
    expect(listed).toEqual(['gpt-4o-mini', 'gpt-5']);
    expect(fallback).toEqual(knownModels('openai'));
  });

  it('sends Google the key in a header when it asks for models', async () => {
    // arrange
    respond = () => ({
      status: 200,
      body: { models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/embedding-001' }] },
    });

    // act
    const listed = await listModels({ provider: 'google', apiKey: KEY, baseUrl });

    // assert
    expect(listed).toEqual(['gemini-2.5-flash']);
    expect(seen[0].url).toBe('/v1/models');
    expect(seen[0].headers['x-goog-api-key']).toBe(KEY);
  });
});
