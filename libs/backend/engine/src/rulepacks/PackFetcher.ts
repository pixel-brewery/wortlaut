// #region Imports

import { createHash } from 'node:crypto';
import { readPackArchive, type IPackFile } from './PackArchive.js';
import { PACK_LIMITS } from './PackLimits.js';
import { PackProblem } from './PackProblem.js';

// #endregion

/**
 * A package as a registry describes it.
 *
 * @public
 */
export interface INpmPackage {
  version: string;
  tarball: string;
  integrity: string | null;
  shasum: string | null;
}

/**
 * Reaches the sources of packs. It only reads, and everything it returns is untrusted data.
 *
 * @public
 */
export interface IPackFetcher {
  /**
   * Finds the commit of a branch, a tag or the default branch.
   *
   * @param owner The owner.
   * @param repository The repository.
   * @param ref The branch, the tag or the commit, or `null` for the default branch.
   * @param signal Cancels it.
   * @returns The full commit.
   */
  resolveCommit(
    owner: string,
    repository: string,
    ref: string | null,
    signal?: AbortSignal,
  ): Promise<string>;

  /**
   * Downloads a repository at a commit.
   *
   * @param owner The owner.
   * @param repository The repository.
   * @param commit The commit.
   * @param signal Cancels it.
   * @returns The files, in memory.
   */
  downloadCommit(
    owner: string,
    repository: string,
    commit: string,
    signal?: AbortSignal,
  ): Promise<Array<IPackFile>>;

  /**
   * Finds a version of an npm package.
   *
   * @param name The package.
   * @param version The version or dist tag, or `null` for the latest.
   * @param signal Cancels it.
   * @returns What the registry says.
   */
  resolvePackage(name: string, version: string | null, signal?: AbortSignal): Promise<INpmPackage>;

  /**
   * Downloads the archive of an npm package. It runs none of its scripts: nothing is installed, the archive is only read.
   *
   * @param found What the registry said.
   * @param signal Cancels it.
   * @returns The files, in memory.
   */
  downloadPackage(found: INpmPackage, signal?: AbortSignal): Promise<Array<IPackFile>>;
}

/**
 * What the real fetcher is composed of.
 *
 * @public
 */
export interface IHttpPackFetcherInit {
  /**
   * The environment, which may name another address of a source, as it may for the AI providers.
   */
  env: NodeJS.ProcessEnv;

  /**
   * The function that makes requests.
   */
  fetch?: typeof fetch;

  /**
   * How long a request may take. The default is the bound of all packs.
   */
  timeoutMs?: number;
}

/**
 * Where GitHub answers, and where it sends archives.
 */
const GITHUB_API = 'https://api.github.com';
const GITHUB_ARCHIVES = 'https://codeload.github.com';

/**
 * Where npm answers.
 */
const NPM_REGISTRY = 'https://registry.npmjs.org';

/**
 * Fetches packs over HTTPS. Every request has a deadline that covers its whole body, reads no more than its bound, follows a
 * redirect only to a host that serves this source, sends no credential, and refuses plain HTTP except to this computer.
 *
 * @public
 */
export class HttpPackFetcher implements IPackFetcher {
  // #region Fields

  private readonly _fetch: typeof fetch;
  private readonly _timeoutMs: number;
  private readonly _github: string;
  private readonly _githubHosts: ReadonlyArray<string>;
  private readonly _npm: string;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `HttpPackFetcher` class.
   *
   * @param init What it is composed of.
   */
  public constructor(init: IHttpPackFetcherInit) {
    this._fetch = init.fetch ?? fetch;
    this._timeoutMs = init.timeoutMs ?? PACK_LIMITS.networkTimeoutMs;
    this._github = init.env.WORTLAUT_GITHUB_API_URL || GITHUB_API;
    this._githubHosts = init.env.WORTLAUT_GITHUB_API_URL
      ? [this._github]
      : [GITHUB_API, GITHUB_ARCHIVES];
    this._npm = init.env.WORTLAUT_NPM_REGISTRY_URL || NPM_REGISTRY;
  }

  // #endregion

  // #region Methods

  /**
   * @override
   */
  public async resolveCommit(
    owner: string,
    repository: string,
    ref: string | null,
    signal?: AbortSignal,
  ): Promise<string> {
    const url = `${this._github}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(ref ?? 'HEAD')}`;
    const body = await this.request(url, {
      accept: 'application/vnd.github.sha',
      maxBytes: 1024,
      hosts: this._githubHosts,
      signal,
      name: `${owner}/${repository}`,
    });
    const commit = body.toString('utf8').trim();

    if (!/^[0-9a-f]{40,64}$/.test(commit)) {
      throw new PackProblem('network', `GitHub gave no commit for ${owner}/${repository}.`);
    }

    return commit;
  }

  /**
   * @override
   */
  public async downloadCommit(
    owner: string,
    repository: string,
    commit: string,
    signal?: AbortSignal,
  ): Promise<Array<IPackFile>> {
    const url = `${this._github}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/tarball/${encodeURIComponent(commit)}`;
    const archive = await this.request(url, {
      accept: 'application/vnd.github+json',
      maxBytes: PACK_LIMITS.maxDownloadBytes,
      hosts: this._githubHosts,
      signal,
      name: `${owner}/${repository}`,
    });

    return readPackArchive(archive);
  }

  /**
   * @override
   */
  public async resolvePackage(
    name: string,
    version: string | null,
    signal?: AbortSignal,
  ): Promise<INpmPackage> {
    const url = `${this._npm}/${name.replace('/', '%2f')}/${encodeURIComponent(version ?? 'latest')}`;
    const body = await this.request(url, {
      accept: 'application/json',
      maxBytes: PACK_LIMITS.maxMetadataBytes,
      hosts: [this._npm],
      signal,
      name,
    });
    let found: {
      version?: unknown;
      dist?: { tarball?: unknown; integrity?: unknown; shasum?: unknown };
    };

    try {
      found = JSON.parse(body.toString('utf8')) as typeof found;
    } catch {
      throw new PackProblem('network', `The registry gave no readable answer about ${name}.`);
    }

    if (typeof found.version !== 'string' || typeof found.dist?.tarball !== 'string') {
      throw new PackProblem('not-a-pack', `The registry names no archive for ${name}.`);
    }

    return {
      version: found.version,
      tarball: found.dist.tarball,
      integrity: typeof found.dist.integrity === 'string' ? found.dist.integrity : null,
      shasum: typeof found.dist.shasum === 'string' ? found.dist.shasum : null,
    };
  }

  /**
   * @override
   */
  public async downloadPackage(
    found: INpmPackage,
    signal?: AbortSignal,
  ): Promise<Array<IPackFile>> {
    const archive = await this.request(found.tarball, {
      accept: 'application/octet-stream',
      maxBytes: PACK_LIMITS.maxDownloadBytes,
      hosts: [this._npm],
      signal,
      name: found.tarball,
    });

    this.verifyIntegrity(archive, found);

    return readPackArchive(archive);
  }

  /**
   * A download that does not match what the registry says is refused.
   *
   * @private
   */
  private verifyIntegrity(archive: Buffer, found: INpmPackage): void {
    const sha512 = found.integrity?.split(/\s+/).find((entry) => entry.startsWith('sha512-'));
    const isIntact = sha512
      ? `sha512-${createHash('sha512').update(archive).digest('base64')}` === sha512
      : !found.shasum || createHash('sha1').update(archive).digest('hex') === found.shasum;

    if (!isIntact) {
      throw new PackProblem(
        'unsafe',
        'The archive of this package does not match what the registry says about it, so Wortlaut refuses it.',
      );
    }
  }

  /**
   * @private
   */
  private async request(
    start: string,
    options: {
      accept: string;
      maxBytes: number;
      hosts: ReadonlyArray<string>;
      signal?: AbortSignal;
      name: string;
    },
  ): Promise<Buffer> {
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(this._timeoutMs)])
      : AbortSignal.timeout(this._timeoutMs);
    let url = start;

    try {
      for (let hop = 0; hop <= PACK_LIMITS.maxRedirects; hop++) {
        this.checkDestination(url, options.hosts);

        const response = await this._fetch(url, {
          redirect: 'manual',
          signal,
          headers: { accept: options.accept, 'user-agent': 'wortlaut' },
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');

          await response.body?.cancel();

          if (!location) {
            throw new PackProblem(
              'network',
              `${options.name} sent a redirect without a destination.`,
            );
          }

          url = new URL(location, url).toString();
          continue;
        }

        if (response.status === 404) {
          await response.body?.cancel();

          throw new PackProblem(
            'not-found',
            `${options.name} was not found. Check the name, and that it is public.`,
          );
        }

        if (!response.ok) {
          await response.body?.cancel();

          throw new PackProblem(
            'network',
            `${options.name} could not be read: the server answered ${response.status}.`,
          );
        }

        return await this.readBody(response, options.maxBytes, options.name);
      }
    } catch (error) {
      if (error instanceof PackProblem) {
        throw error;
      }

      if (signal.aborted) {
        throw new PackProblem(
          'network',
          `${options.name} did not answer within ${Math.round(this._timeoutMs / 1000)} seconds.`,
        );
      }

      throw new PackProblem(
        'network',
        `${options.name} could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    throw new PackProblem('network', `${options.name} redirects too often.`);
  }

  /**
   * Reads a body and stops at its bound, whatever the server promised.
   *
   * @private
   */
  private async readBody(response: Response, maxBytes: number, name: string): Promise<Buffer> {
    const tooLarge = (): PackProblem =>
      new PackProblem('too-large', `${name} is larger than ${maxBytes} bytes.`);

    if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
      await response.body?.cancel();

      throw tooLarge();
    }

    const chunks = new Array<Buffer>();
    let total = 0;

    if (!response.body) {
      return Buffer.alloc(0);
    }

    const reader = response.body.getReader();

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        return Buffer.concat(chunks, total);
      }

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel();

        throw tooLarge();
      }

      chunks.push(Buffer.from(value));
    }
  }

  /**
   * Allows only the hosts of this source, over HTTPS, without credentials. Plain HTTP is for a server on this computer.
   *
   * @private
   */
  private checkDestination(url: string, hosts: ReadonlyArray<string>): void {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      throw new PackProblem('unsafe', 'A source named an address that cannot be read.');
    }

    const isLocal =
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '[::1]';
    const isAllowed = hosts.some((host) => new URL(host).origin === parsed.origin);

    if (
      parsed.username ||
      parsed.password ||
      !isAllowed ||
      (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal))
    ) {
      throw new PackProblem(
        'unsafe',
        `A source pointed at ${parsed.protocol}//${parsed.host}, which is not where this pack comes from, so Wortlaut refuses it.`,
      );
    }
  }

  // #endregion
}
