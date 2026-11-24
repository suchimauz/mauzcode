/**
 * Return the single authoritative set of documented budgets for bounded skill package discovery and reading.
 *
 * Expose the exact limits enforced by skills.packageScan and skills.packageFiles as plain data, so callers, documentation and tests report the same values a reader enforces. Pure synchronous metadata: no filesystem, network or state.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): types.skills.Limits {
    return {
        packages: 100,
        entries: 400,
        headerBytes: 16_384,
        instructionsBytes: 262_144,
        resources: 500,
        resourceEntries: 2_000,
        depth: 8,
        resourceBytes: 2_097_152,
        packageBytes: 8_388_608,
        pageBytes: 65_536,
        diagnostics: 20,
        diagnosticChars: 240,
    };
}
