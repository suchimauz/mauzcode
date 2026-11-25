/** One discovered package as the private scan layer reports it: qualified identity plus the bounded header evidence, never a filesystem location. */
export type PackageEntry = {
    /** Qualified identity and public fields built by skills.qualifiedId. */
    descriptor: types.skills.Descriptor;
    /** Package directory name inside the scanned container, equal to the manifest name. */
    directoryName: string;
    /** Manifest parsed by skills.parseManifest from the bounded header bytes only. */
    manifest: types.skills.Manifest;
    /** Exact SKILL.md bytes read at discovery: through the closing --- line, never the body. */
    headerBytes: number;
};
