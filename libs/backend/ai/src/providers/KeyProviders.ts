/**
 * The providers that work with an API key.
 *
 * @public
 */
export type KeyProviderId = 'openai' | 'google';

/**
 * Who answers a request for models or a test of a key.
 *
 * @public
 */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    redirect: 'error';
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * How long a test of a key may take.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The models a provider offers when it cannot be asked.
 */
const KNOWN_MODELS: Readonly<Record<KeyProviderId, ReadonlyArray<string>>> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
};

/**
 * What it takes to ask a provider.
 *
 * @public
 */
export interface IKeyRequest {
  provider: KeyProviderId;
  apiKey: string;

  /**
   * Another address of the provider.
   */
  baseUrl?: string;
  fetch?: FetchLike;
}

/**
 * The result of a test of a key. Its message holds neither the key nor what the provider answered.
 *
 * @public
 */
export interface IKeyTest {
  ok: boolean;
  message: string;
}

/**
 * Returns the models a provider is known to offer.
 *
 * @public
 * @param provider The provider.
 * @returns The models, the usual one first.
 */
export function knownModels(provider: KeyProviderId): Array<string> {
  return [...KNOWN_MODELS[provider]];
}

/**
 * Asks a provider which models this key may use. A provider that cannot be asked leaves the list of known models.
 *
 * @public
 * @param request The request.
 * @returns The models.
 */
export async function listModels(request: IKeyRequest): Promise<Array<string>> {
  try {
    const response = await ask(request);

    if (!response.ok) {
      return knownModels(request.provider);
    }

    const listed = namesOf(request.provider, await response.json());

    return listed.length > 0
      ? sortKnownFirst(request.provider, listed)
      : knownModels(request.provider);
  } catch {
    return knownModels(request.provider);
  }
}

/**
 * Tests a key against the provider.
 *
 * @public
 * @param request The request.
 * @returns The result.
 */
export async function testKey(request: IKeyRequest): Promise<IKeyTest> {
  try {
    const response = await ask(request);

    if (response.ok) {
      return { ok: true, message: 'The provider accepted this key.' };
    }

    return response.status === 400 || response.status === 401 || response.status === 403
      ? { ok: false, message: 'The provider rejected this key.' }
      : { ok: false, message: `The provider answered with status ${response.status}.` };
  } catch {
    return { ok: false, message: 'The provider could not be reached.' };
  }
}

/**
 * The key travels in a header, so it never stands in a URL that something might log.
 *
 * @private
 */
function ask(request: IKeyRequest): ReturnType<FetchLike> {
  const fetcher = request.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  return request.provider === 'openai'
    ? fetcher(`${trim(request.baseUrl ?? 'https://api.openai.com/v1')}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${request.apiKey}` },
        redirect: 'error',
        signal,
      })
    : fetcher(
        `${trim(request.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta')}/models`,
        { method: 'GET', headers: { 'x-goog-api-key': request.apiKey }, redirect: 'error', signal },
      );
}

/**
 * @private
 */
function trim(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * @private
 */
function namesOf(provider: KeyProviderId, body: unknown): Array<string> {
  if (provider === 'openai') {
    const data = (body as { data?: Array<{ id?: unknown }> } | null)?.data ?? [];

    return data
      .map((model) => model.id)
      .filter((id): id is string => typeof id === 'string' && /^(?:gpt|o\d|chatgpt)/.test(id));
  }

  const models = (body as { models?: Array<{ name?: unknown }> } | null)?.models ?? [];

  return models
    .map((model) => model.name)
    .filter((name): name is string => typeof name === 'string' && name.includes('gemini'))
    .map((name) => name.replace(/^models\//, ''));
}

/**
 * @private
 */
function sortKnownFirst(provider: KeyProviderId, models: ReadonlyArray<string>): Array<string> {
  const known = KNOWN_MODELS[provider];

  return [
    ...known.filter((model) => models.includes(model)),
    ...models.filter((model) => !known.includes(model)).sort(),
  ];
}
