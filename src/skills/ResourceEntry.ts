/** One packaged resource as the bounded inventory reports it: package-relative path and size only, never contents or a filesystem location. */
export type ResourceEntry = {
    /** Package-relative slash path, e.g. references/checklist.md; safe to echo back as opts.path. */
    path: string;
    /** Verified size in bytes of the regular file behind this path. */
    bytes: number;
    /** Present and true when the file has an executable permission bit, so a materialized copy can keep it. */
    executable?: boolean;
};
