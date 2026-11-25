/** Result of one bounded scan of a trusted skill container: package entries, package-scoped diagnostics and truncation, never a filesystem location. */
export type ScanResult =
    | {
        /** Discovery ran over the anchor; individual packages may still be malformed and reported in diagnostics. */
        ok: true;
        /** Healthy packages found, at most limits.packages, each with its bounded header evidence. */
        packages: types.skills.PackageEntry[];
        /** Bounded package-scoped diagnostics; a malformed package never suppresses its healthy neighbours. */
        diagnostics: string[];
        /** True when any budget (entries, packages or diagnostics) cut the scan short before the container was exhausted. */
        truncated: boolean;
    }
    | {
        /** The anchor itself could not be opened or validated; no package data is returned. */
        ok: false;
        /** Bounded reason naming the failure without exposing paths beyond the caller's own anchor. */
        reason: string;
    };
