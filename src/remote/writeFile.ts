/**
 * Writes a UTF-8 text file on a remote SSH server atomically under a per-file lock, with optional version, content or absence preconditions.
 *
 * Streams the content through stdin of the persistent remote.exec connection into an exclusive temp file next to the target, then, under a lock directory ~/.mauzcode/locks/<sha256(path)> on the remote host with an owner file and bounded waiting, checks the preconditions and renames into place, keeping the mode and writing through symlinks. A refused write throws an Error read by files.refusalOf (conflict or busy). Relative paths resolve against the remote home; ~/ is supported. Used by files.write when a `host` is given.
 * @param opts.host SSH host alias from ~/.ssh/config (see remote.servers).
 * @param opts.path Remote file path; relative to the remote home, ~/ allowed.
 * @param opts.content Full file body written verbatim.
 * @param opts.expectedContent Expected current file content (compared by md5); refused with conflict when the remote file differs.
 * @param opts.expectedVersion Expected sha256 hex of the current raw bytes; refused with conflict when it differs or the file is missing.
 * @param opts.ifAbsent Refuse with conflict when the file already exists. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** SSH host alias from ~/.ssh/config (see remote.servers). */
        host: string;
        /** Remote file path; relative to the remote home, ~/ allowed. */
        path: string;
        /** Full file body written verbatim. */
        content: string;
        /** Expected current file content (compared by md5); refused with conflict when the remote file differs. */
        expectedContent?: string;
        /** Expected sha256 hex of the current raw bytes; refused with conflict when it differs or the file is missing. */
        expectedVersion?: string;
        /** Refuse with conflict when the file already exists. @default false */
        ifAbsent?: boolean;
    },
): Promise<{ bytes: number; version: string }> {
    const rp = ctx.fns.remote.quote({ value: opts.path, path: true });
    const md5 = opts.expectedContent != null ? new Bun.CryptoHasher("md5").update(opts.expectedContent).digest("hex") : "";
    const sha = opts.expectedVersion != null ? String(opts.expectedVersion).toLowerCase().replace(/[^0-9a-f]/g, "") : "";
    const version = new Bun.CryptoHasher("sha256").update(opts.content).digest("hex");
    // 1. Upload into a private temp file (mktemp: exclusive, unpredictable) next
    //    to the target, so the final rename is atomic on the same filesystem.
    // 2. Under a per-file lock directory outside the tree (mkdir is atomic), check
    //    the preconditions, copy the current mode onto the temp file, then rename.
    //    Cooperating writers serialize on the lock; a writer that ignores it can
    //    still race — the check narrows, not closes, that window.
    // A symlink is written through to its target instead of being replaced.
    // Exit codes: 8 busy, 9 changed, 10 exists, 11 absent.
    const script = [
        "f=" + rp,
        '[ -L "$f" ] && f=$(readlink -f -- "$f" 2>/dev/null || echo "$f")',
        'd=$(dirname -- "$f"); mkdir -p -- "$d" || exit 1',
        'f="$(cd -- "$d" && pwd -P)/$(basename -- "$f")"',
        't=$(mktemp "$d/.mauzcode-write.XXXXXX") || exit 1',
        'L="$HOME/.mauzcode/locks"; mkdir -p -- "$L" || exit 1',
        'k=$( { printf %s "$f" | sha256sum 2>/dev/null || printf %s "$f" | shasum -a 256; } | cut -d" " -f1)',
        'l="$L/$k"; locked=0',
        'cleanup(){ rm -f -- "$t"; [ "$locked" = 1 ] && { rm -f -- "$l/owner"; rmdir -- "$l" 2>/dev/null; }; }',
        "trap cleanup EXIT",
        'cat > "$t" || exit 1',
        'i=0; until mkdir -- "$l" 2>/dev/null; do i=$((i+1)); [ $i -ge 100 ] && { echo "lock=$l"; echo "owner=$(cat -- "$l/owner" 2>/dev/null)"; exit 8; }; sleep 0.05; done; locked=1',
        'echo "pid=$$ host=$(hostname) started=$(date -u +%Y-%m-%dT%H:%M:%SZ) file=$f" > "$l/owner"',
        opts.ifAbsent ? '[ -e "$f" ] && exit 10' : ":",
        (md5 || sha) ? '[ -e "$f" ] || exit 11' : ":",
        sha ? 'cur=$( { sha256sum -- "$f" 2>/dev/null || shasum -a 256 -- "$f"; } | cut -d" " -f1); [ "$cur" = ' + sha + " ] || exit 9" : ":",
        md5 ? 'cur=$( { md5sum -- "$f" 2>/dev/null || md5 -r -- "$f"; } | cut -d" " -f1); [ "$cur" = ' + md5 + " ] || exit 9" : ":",
        'if [ -e "$f" ]; then m=$(stat -c %a -- "$f" 2>/dev/null || stat -f %Lp -- "$f" 2>/dev/null) && chmod "$m" "$t"; else chmod 644 "$t"; fi',
        'mv -f -- "$t" "$f"',
    ].join("\n");
    const r = await ctx.fns.remote.exec({ host: opts.host, stdin: opts.content, command: script });
    const target = `${opts.host}:${opts.path}`;
    if (r.exitCode === 8) {
        const lockPath = /^lock=(.*)$/m.exec(r.stdout)?.[1];
        const owner = /^owner=(.*)$/m.exec(r.stdout)?.[1];
        throw ctx.fns.files.refusal({ code: "busy", lockPath, owner, target });
    }
    if (r.exitCode === 9) throw ctx.fns.files.refusal({ code: "conflict", reason: "changed", target });
    if (r.exitCode === 10) throw ctx.fns.files.refusal({ code: "conflict", reason: "exists", target });
    if (r.exitCode === 11) throw ctx.fns.files.refusal({ code: "conflict", reason: "absent", target });
    if (r.exitCode !== 0) throw new Error(`${target}: ${(r.stderr || "exit " + r.exitCode).trim()}`);
    return { bytes: Buffer.byteLength(opts.content), version };
}
