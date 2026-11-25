/** Result of one bounded inventory or resource read of a single package; carries package-relative names and bytes only, never a filesystem location. */
export type FilesResult =
    | {
        /** The package directory was opened and the requested work stayed inside it. */
        ok: true;
        /** Which bounded action ran: listing packaged resources, or reading one page of one file. */
        action: 'list';
        /** Package-relative resources with verified byte sizes, sorted by path and at most the resource limit; never the manifest itself. */
        resources: types.skills.ResourceEntry[];
        /** Verified size of SKILL.md in bytes. */
        manifestBytes: number;
        /** True when SKILL.md exceeds the accepted instruction limit, so its instructions cannot be read. */
        manifestOversized: boolean;
        /** Verified bytes of every regular file in the package, manifest included; absent when a count or depth budget left part of the package unexamined, because a partial sum proves nothing about the limit. */
        packageBytes?: number;
        /** Entries deliberately left out: symbolic links, special files and objects beyond the depth limit. */
        skipped: number;
        /** True when a count budget stopped the inventory, or when part of the package stayed unexamined. */
        truncated: boolean;
    }
    | {
        /** The package directory was opened and the requested page stayed inside it. */
        ok: true;
        /** Which bounded action ran: listing packaged resources, or reading one page of one file. */
        action: 'read';
        /** The package-relative path echoed back verbatim. */
        path: string;
        /** The exact bytes of this page, never more than the documented page limit. */
        bytes: Buffer;
        /** Byte offset this page starts at. */
        offset: number;
        /** Offset to pass back for the continuation page; equal to total when the file ended. */
        nextOffset: number;
        /** True when more bytes follow this page. */
        hasMore: boolean;
        /** Verified total size of the file in bytes. */
        total: number;
    }
    | {
        /** Nothing was read; the reason is bounded and names no target outside the package. */
        ok: false;
        /** Bounded explanation naming the rejected name, type or limit without exposing a path outside the package. */
        reason: string;
    };
