/**
 * The bounds on everything that comes from outside as a rule pack. A pack is a small file of data, so these are generous for
 * a pack and small for an attack.
 *
 * @internal
 */
export const PACK_LIMITS = {

    /**
     * How long one request to a source may take, its whole body included.
     */
    networkTimeoutMs: 30_000,

    /**
     * How many redirects a request may follow.
     */
    maxRedirects: 3,

    /**
     * The largest archive that is downloaded.
     */
    maxDownloadBytes: 16 * 1024 * 1024,

    /**
     * The largest answer of a registry about a package.
     */
    maxMetadataBytes: 1024 * 1024,

    /**
     * What an archive may hold unpacked, against an archive that expands without end.
     */
    maxUnpackedBytes: 64 * 1024 * 1024,

    /**
     * The largest single file of a pack.
     */
    maxFileBytes: 4 * 1024 * 1024,

    /**
     * The largest definition file.
     */
    maxManifestBytes: 1024 * 1024,

    /**
     * How many files a pack may hold.
     */
    maxFiles: 2000
} as const;
