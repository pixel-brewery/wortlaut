// #region Imports

import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { HttpPackFetcher } from './PackFetcher';
import { PACK_LIMITS } from './PackLimits';
import { PackProblem } from './PackProblem';
import { createTarball } from './testing/PackFixtures';

// #endregion

const COMMIT = 'b'.repeat(40);
const TARBALL = createTarball([{ path: 'owner-repo/wortlaut-pack.json', content: '{}' }]);

function respond(body: BodyInit | null, init: ResponseInit = {}): Response {
    return new Response(body, init);
}

async function problemOf(action: () => Promise<unknown>): Promise<ReturnType<PackProblem['describe']>> {
    try {
        await action();
    } catch (error) {
        if (error instanceof PackProblem) {
            return error.describe();
        }

        throw error;
    }

    throw new Error('It did not refuse.');
}

describe('HttpPackFetcher', () => {
    it('finds a commit and follows GitHub to its archives', async () => {
        // arrange
        const urls = new Array<string>();
        const fetcher = new HttpPackFetcher({
            env: {},
            fetch: vi.fn((url: string) => {
                urls.push(url);

                if (url.includes('/commits/')) {
                    return Promise.resolve(respond(COMMIT));
                }

                return Promise.resolve(url.startsWith('https://api.github.com')
                    ? respond(null, { status: 302, headers: { location: 'https://codeload.github.com/owner/repo/tar.gz/x' } })
                    : respond(TARBALL));
            }) as unknown as typeof fetch
        });

        // act
        const commit = await fetcher.resolveCommit('owner', 'repo', 'main');
        const files = await fetcher.downloadCommit('owner', 'repo', commit);

        // assert
        expect(commit).toBe(COMMIT);
        expect(urls).toEqual([
            'https://api.github.com/repos/owner/repo/commits/main',
            `https://api.github.com/repos/owner/repo/tarball/${COMMIT}`,
            'https://codeload.github.com/owner/repo/tar.gz/x'
        ]);
        expect(files.map((file) => file.path)).toEqual(['wortlaut-pack.json']);
    });

    it('refuses a redirect to a host that does not serve this source, without asking it', async () => {
        // arrange
        const fetchMock = vi.fn(() => Promise.resolve(respond(null, { status: 302, headers: { location: 'https://evil.example/pack.tgz' } })));
        const fetcher = new HttpPackFetcher({ env: {}, fetch: fetchMock as unknown as typeof fetch });

        // act
        const problem = await problemOf(() => fetcher.downloadCommit('owner', 'repo', COMMIT));

        // assert
        expect(problem).toMatchObject({ kind: 'unsafe', message: expect.stringContaining('evil.example') });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('refuses plain HTTP to another computer, and credentials in an address', async () => {
        // arrange
        const fetchMock = vi.fn();

        // act & assert
        expect(await problemOf(() => new HttpPackFetcher({ env: { WORTLAUT_GITHUB_API_URL: 'http://example.com' }, fetch: fetchMock as unknown as typeof fetch }).resolveCommit('o', 'r', null))).toMatchObject({ kind: 'unsafe' });
        expect(await problemOf(() => new HttpPackFetcher({ env: { WORTLAUT_NPM_REGISTRY_URL: 'https://user:secret@registry.example' }, fetch: fetchMock as unknown as typeof fetch }).resolvePackage('a', null))).toMatchObject({ kind: 'unsafe' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('stops following redirects after its bound', async () => {
        // arrange
        const fetchMock = vi.fn(() => Promise.resolve(respond(null, { status: 302, headers: { location: 'https://api.github.com/again' } })));
        const fetcher = new HttpPackFetcher({ env: {}, fetch: fetchMock as unknown as typeof fetch });

        // act
        const problem = await problemOf(() => fetcher.downloadCommit('owner', 'repo', COMMIT));

        // assert
        expect(problem.message).toMatch(/redirects too often/);
        expect(fetchMock).toHaveBeenCalledTimes(PACK_LIMITS.maxRedirects + 1);
    });

    it('gives up at its deadline, for a server that never answers', async () => {
        // arrange
        const fetcher = new HttpPackFetcher({
            env: {},
            timeoutMs: 50,
            fetch: ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
                init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            })) as unknown as typeof fetch
        });
        const startedAt = performance.now();

        // act
        const problem = await problemOf(() => fetcher.resolveCommit('owner', 'repo', null));

        // assert
        expect(problem).toMatchObject({ kind: 'network', message: expect.stringContaining('did not answer') });
        expect(performance.now() - startedAt).toBeLessThan(2000);
    });

    it('gives up at its deadline for a body that never ends', async () => {
        // arrange
        const stalled = new ReadableStream<Uint8Array>({ start: (controller) => controller.enqueue(new Uint8Array(1)) });
        const fetcher = new HttpPackFetcher({
            env: {},
            timeoutMs: 50,
            fetch: ((_url: string, init: RequestInit) => {
                const reader = stalled.getReader();
                const body = new ReadableStream<Uint8Array>({
                    pull: (controller) => reader.read().then(({ value }) => {
                        if (value) {
                            controller.enqueue(value);
                        }

                        return new Promise<void>((_resolve, reject) => {
                            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
                        });
                    })
                });

                return Promise.resolve(new Response(body));
            }) as unknown as typeof fetch
        });

        // act
        const problem = await problemOf(() => fetcher.downloadCommit('owner', 'repo', COMMIT));

        // assert
        expect(problem).toMatchObject({ kind: 'network', message: expect.stringContaining('did not answer') });
    });

    it('stops reading at its bound, whatever the server promised', async () => {
        // arrange
        let sent = 0;
        const endless = new ReadableStream<Uint8Array>({
            pull: (controller) => {
                sent += 1024 * 1024;
                controller.enqueue(new Uint8Array(1024 * 1024));
            }
        });
        const fetcher = new HttpPackFetcher({ env: {}, fetch: (() => Promise.resolve(new Response(endless))) as unknown as typeof fetch });

        // act
        const problem = await problemOf(() => fetcher.downloadCommit('owner', 'repo', COMMIT));

        // assert
        expect(problem.kind).toBe('too-large');
        expect(sent).toBeLessThan(PACK_LIMITS.maxDownloadBytes * 2);
    });

    it('believes a promised size that is too large and reads nothing', async () => {
        // arrange
        const fetcher = new HttpPackFetcher({ env: {}, fetch: (() => Promise.resolve(respond('x', { headers: { 'content-length': String(PACK_LIMITS.maxDownloadBytes + 1) } }))) as unknown as typeof fetch });

        // act & assert
        expect((await problemOf(() => fetcher.downloadCommit('owner', 'repo', COMMIT))).kind).toBe('too-large');
    });

    it('says not found for a repository that is not there, and a code for what else a server says', async () => {
        // act & assert
        expect((await problemOf(() => new HttpPackFetcher({ env: {}, fetch: (() => Promise.resolve(respond('', { status: 404 }))) as unknown as typeof fetch }).resolveCommit('o', 'r', null))).kind).toBe('not-found');
        expect(await problemOf(() => new HttpPackFetcher({ env: {}, fetch: (() => Promise.resolve(respond('', { status: 403 }))) as unknown as typeof fetch }).resolveCommit('o', 'r', null))).toMatchObject({ kind: 'network', message: expect.stringContaining('403') });
    });

    it('sends no credential, whatever the environment holds', async () => {
        // arrange
        const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(respond(COMMIT)));
        const fetcher = new HttpPackFetcher({ env: { GITHUB_TOKEN: 'secret-token' }, fetch: fetchMock as unknown as typeof fetch });

        // act
        await fetcher.resolveCommit('owner', 'repo', null);

        // assert
        expect(JSON.stringify(fetchMock.mock.calls[0][1].headers)).not.toContain('secret-token');
        expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('authorization');
    });

    describe('npm', () => {
        const registry = (metadata: unknown, archive: Buffer = TARBALL): typeof fetch => ((url: string) => Promise.resolve(url.endsWith('.tgz') ? respond(archive) : respond(JSON.stringify(metadata)))) as unknown as typeof fetch;
        const metadata = (dist: Record<string, unknown>): unknown => ({ version: '1.2.0', dist: { tarball: 'https://registry.npmjs.org/a/-/a-1.2.0.tgz', ...dist } });

        it('reads a package only as an archive, after comparing it with what the registry says', async () => {
            // arrange
            const integrity = `sha512-${createHash('sha512').update(TARBALL)
                .digest('base64')}`;
            const fetcher = new HttpPackFetcher({ env: {}, fetch: registry(metadata({ integrity })) });

            // act
            const found = await fetcher.resolvePackage('@scope/a', null);
            const files = await fetcher.downloadPackage(found);

            // assert
            expect(found.version).toBe('1.2.0');
            expect(files.map((file) => file.path)).toEqual(['wortlaut-pack.json']);
        });

        it('refuses an archive that does not match the registry', async () => {
            // arrange
            const fetcher = new HttpPackFetcher({ env: {}, fetch: registry(metadata({ integrity: `sha512-${'A'.repeat(86)}==` })) });

            // act
            const problem = await problemOf(async () => fetcher.downloadPackage(await fetcher.resolvePackage('a', null)));

            // assert
            expect(problem).toMatchObject({ kind: 'unsafe', message: expect.stringContaining('does not match') });
        });

        it('refuses an archive the registry places somewhere else', async () => {
            // arrange
            const fetcher = new HttpPackFetcher({ env: {}, fetch: registry({ version: '1.0.0', dist: { tarball: 'https://evil.example/a.tgz' } }) });

            // act
            const problem = await problemOf(async () => fetcher.downloadPackage(await fetcher.resolvePackage('a', null)));

            // assert
            expect(problem).toMatchObject({ kind: 'unsafe', message: expect.stringContaining('evil.example') });
        });
    });
});
