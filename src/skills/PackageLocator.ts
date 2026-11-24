/** One validated request to open exactly one package below a trusted anchor, keeping the trusted directory apart from the untrusted package and resource names a caller supplies. */
export type PackageLocator = {
    /** Normalized absolute directory the caller already trusts; every object opened for this request must stay inside it. */
    anchorDir: string;
    /** Untrusted package directory name inside the anchor, validated as one lowercase package name. */
    packageName?: string;
    /** Untrusted package-relative path split into validated components, never absolute and never containing . or .. ; empty when no file was requested. */
    components: string[];
};
