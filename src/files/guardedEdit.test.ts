// The guarded file contract end to end through the real tool handlers:
// read issues a readId, edit/write are checked against it, line endings survive.
import { test, expect, describe, afterAll } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

const DIR = `.test-tmp/guarded-${process.pid}`;
afterAll(async () => { await Bun.$`rm -rf ${DIR}`.quiet(); });

let n = 0;
async function setup(agentId = "ga") {
    const ctx: any = await mkTestCtx({ db: false, env: { MAUZCODE_LOCKS_DIR: `${process.cwd()}/${DIR}/locks` } });
    const agent = { id: agentId, workspaceDir: process.cwd() };
    const as = (id: string) => { const c = Object.create(ctx); c.session = { kind: "agent", agentId: id, agent: { ...agent, id } }; return c; };
    const path = `${DIR}/f${n++}.txt`;
    return { ctx, s: as(agentId), as, path };
}
const readId = (out: string) => /^readId: (\S+)/m.exec(out)?.[1]!;
// Raw bytes as UTF-8, BOM kept (Bun.file().text() strips it).
const raw = async (p: string) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await Bun.file(p).arrayBuffer());
const anchors = (out: string) => out.split("\n").filter(l => /^\d+[a-z0-9]{2}\|/.test(l)).map(l => l.split("|")[0]!);

describe("read receipts", () => {
    test("read issues a readId with range and completeness; session-less read issues none", async () => {
        const { ctx, s, path } = await setup();
        await Bun.write(path, "a\nb\nc\nd\n");
        const full = await s.fns.tools.read({ path });
        expect(full).toMatch(/^readId: r\w{8} · lines 1-4 of 4 · complete\na\nb\nc\nd/);
        const part = await s.fns.tools.read({ path, startLine: 2, endLine: 3 });
        expect(part).toMatch(/^readId: r\w{8} · lines 2-3 of 4 · partial\nb\nc$/);
        const hl = await s.fns.tools.read({ path, hashline: true });
        expect(hl.split("\n")[1]).toMatch(/^1[a-z0-9]{2}\|a$/);
        expect(await ctx.fns.tools.read({ path })).toBe("a\nb\nc\nd\n");
    });

    test("binary content gets no readId", async () => {
        const { s, path } = await setup();
        await Bun.write(path, new Uint8Array([0x61, 0, 0x62]));
        expect(await s.fns.tools.read({ path })).not.toContain("readId:");
    });

    test("another session's readId resolves as expired; expiry and eviction", async () => {
        const { s, as, path } = await setup("a1");
        await Bun.write(path, "x\n");
        const id = readId(await s.fns.tools.read({ path }));
        const other = await as("a2").fns.tools.edit({ readId: id, mode: "literal", edits: [{ oldText: "x", newText: "y" }] });
        expect(other.output).toMatch(/^expired:/);
        expect(other.output).toContain("nothing was written");
        expect(await raw(path)).toBe("x\n");
        // expiry
        const st = (s.state as any).files.receipts.get("a1").get(id);
        st.expiresAt = Date.now() - 1;
        expect(s.fns.files.useReceipt({ readId: id })).toBeNull();
        // eviction: the oldest of 501 receipts is gone
        const snap = await s.fns.files.snapshot({ path });
        const first = s.fns.files.issueReceipt({ snapshot: snap, start: 1, end: 1 });
        for (let i = 0; i < 500; i++) s.fns.files.issueReceipt({ snapshot: snap, start: 1, end: 1 });
        expect(s.fns.files.useReceipt({ readId: first.id })).toBeNull();
    });

    test("use slides the expiry", async () => {
        const { s, path } = await setup();
        await Bun.write(path, "x\n");
        const id = readId(await s.fns.tools.read({ path }));
        const r = (s.state as any).files.receipts.get("ga").get(id);
        r.expiresAt = Date.now() + 1000;
        s.fns.files.useReceipt({ readId: id });
        expect(r.expiresAt).toBeGreaterThan(Date.now() + 29 * 60 * 1000);
    });
});

describe("guarded edit", () => {
    test("literal and anchor happy paths, chained by the returned readId", async () => {
        const { s, path } = await setup();
        await Bun.write(path, "one\ntwo\nthree\n");
        const r1 = await s.fns.tools.edit({ readId: readId(await s.fns.tools.read({ path })), mode: "literal", edits: [{ oldText: "two", newText: "TWO" }] });
        expect(r1.output).toMatch(/^applied:/);
        expect(await raw(path)).toBe("one\nTWO\nthree\n");
        // the returned readId is hashline (no: literal) and chains
        const r2 = await s.fns.tools.edit({ readId: readId(r1.output), mode: "literal", edits: [{ oldText: "three", newText: "3" }] });
        expect(r2.output).toMatch(/^applied:/);
        const hl = await s.fns.tools.read({ path, hashline: true });
        const a = anchors(hl);
        const r3 = await s.fns.tools.edit({ readId: readId(hl), mode: "anchor", edits: [{ op: "replaceLines", anchor: a[0], text: "1" }, { op: "insertAfter", anchor: "EOF", text: "4" }] });
        expect(r3.output).toMatch(/^applied:/);
        expect(await raw(path)).toBe("1\nTWO\n3\n4\n");
        // the old readId is retired
        const again = await s.fns.tools.edit({ readId: readId(hl), mode: "anchor", edits: [{ op: "delete", anchor: a[0] }] });
        expect(again.output).toMatch(/^expired:/);
    });

    test("invalid: mixed modes, outside range, ambiguous, no-op, overlap, mode without readId", async () => {
        const { s, path } = await setup();
        await Bun.write(path, "a\nb\na\nc\n");
        const part = await s.fns.tools.read({ path, startLine: 3, endLine: 4, hashline: true });
        const id = readId(part);
        const full = await s.fns.tools.read({ path, hashline: true });
        const all = anchors(full);
        const cases: any[] = [
            { readId: id, mode: "anchor", edits: [{ oldText: "a", newText: "x" }] },
            { readId: id, mode: "anchor", edits: [{ op: "delete", anchor: all[0] }] },
            { readId: readId(full), mode: "literal", edits: [{ oldText: "a", newText: "x" }] },
            { readId: readId(full), mode: "literal", edits: [{ oldText: "b", newText: "b" }] },
            { readId: readId(full), mode: "anchor", edits: [{ op: "delete", anchor: all[0], endAnchor: all[1] }, { op: "replaceLines", anchor: all[1], text: "z" }] },
            { path, mode: "literal", edits: [{ oldText: "c", newText: "d" }] },
            { readId: id, mode: "literal", path: "elsewhere.txt", edits: [{ oldText: "c", newText: "d" }] },
        ];
        for (const args of cases) {
            const r = await s.fns.tools.edit(args);
            expect(r.output).toMatch(/^invalid:/);
            expect(r.output).toContain("nothing was written");
        }
        const amb = await s.fns.tools.edit({ readId: readId(await s.fns.tools.read({ path })), mode: "literal", edits: [{ oldText: "a", newText: "x" }] });
        expect(amb.output).toContain("found 2");
        // a literal match outside the delivered range does not count
        const r = await s.fns.tools.edit({ readId: id, mode: "literal", edits: [{ oldText: "a", newText: "x" }] });
        expect(r.output).toMatch(/^applied:/);
        expect(await raw(path)).toBe("a\nb\nx\nc\n");
    });

    test("conflict returns the fresh range and a new readId; the other change survives", async () => {
        const { s, path } = await setup();
        await Bun.write(path, "a\nb\nc\n");
        const id = readId(await s.fns.tools.read({ path, startLine: 2, endLine: 3 }));
        await s.fns.files.write({ path, content: "a\nB\nc\n" });
        const r = await s.fns.tools.edit({ readId: id, mode: "literal", edits: [{ oldText: "b", newText: "x" }] });
        expect(r.output).toMatch(/^conflict:/);
        expect(r.output).toContain("nothing was written");
        expect(r.output).toMatch(/readId: \S+ · lines 2-3 of 3 · partial\nB\nc$/);
        expect(await raw(path)).toBe("a\nB\nc\n");
        const retry = await s.fns.tools.edit({ readId: readId(r.output), mode: "literal", edits: [{ oldText: "B", newText: "x" }] });
        expect(retry.output).toMatch(/^applied:/);
    });

    test("legacy path-only edit applies with a warning and a readId", async () => {
        const { s, path } = await setup();
        await Bun.write(path, "a\n");
        const r = await s.fns.tools.edit({ path, edits: [{ oldText: "a", newText: "b" }] });
        expect(r.output).toMatch(/^applied:/);
        expect(r.output).toContain("warning: no readId");
        expect(r.output).toMatch(/readId: r\w{8}/);
    });

    test("files.editHashline goes through the same engine", async () => {
        const { s, path } = await setup();
        await Bun.write(path, "a\r\nb\r\n");
        const a = (await s.fns.files.readHashline({ path })).lines.map((l: any) => l.anchor);
        await s.fns.files.editHashline({ input: `@${path}\n= ${a[1]}\n|B` });
        expect(await raw(path)).toBe("a\r\nB\r\n");
    });
});

describe("line endings", () => {
    test("CRLF anchor replace keeps CRLF on every line", async () => {
        const { s, path } = await setup();
        await Bun.write(path, "a\r\nb\r\nc\r\n");
        const hl = await s.fns.tools.read({ path, hashline: true });
        const a = anchors(hl);
        const r = await s.fns.tools.edit({ readId: readId(hl), mode: "anchor", edits: [{ op: "replaceLines", anchor: a[1], text: "B\nB2" }] });
        expect(r.output).toMatch(/^applied:/);
        expect(await raw(path)).toBe("a\r\nB\r\nB2\r\nc\r\n");
    });

    test("CRLF multi-line literal matches the LF view and writes CRLF", async () => {
        const { s, path } = await setup();
        await Bun.write(path, "a\r\nb\r\nc\r\n");
        const r = await s.fns.tools.edit({ readId: readId(await s.fns.tools.read({ path })), mode: "literal", edits: [{ oldText: "a\nb", newText: "x\ny\nz" }] });
        expect(r.output).toMatch(/^applied:/);
        expect(await raw(path)).toBe("x\r\ny\r\nz\r\nc\r\n");
    });

    test("mixed EOL: untouched lines keep their bytes; BOM and missing final newline survive", async () => {
        const { s, path } = await setup();
        await Bun.write(path, "\uFEFFa\r\nb\nc\r\nd");
        const r = await s.fns.tools.edit({ readId: readId(await s.fns.tools.read({ path })), mode: "literal", edits: [{ oldText: "d", newText: "D" }] });
        expect(r.output).toMatch(/^applied:/);
        expect(await raw(path)).toBe("\uFEFFa\r\nb\nc\r\nD");
        const r2 = await s.fns.tools.edit({ readId: readId(r.output), mode: "literal", edits: [{ oldText: "b", newText: "b1\nb2" }] });
        expect(r2.output).toMatch(/^applied:/);
        expect(await raw(path)).toBe("\uFEFFa\r\nb1\r\nb2\nc\r\nD");
    });
});

describe("write modes", () => {
    test("create refuses an existing file; replace needs a complete, current read", async () => {
        const { s, path } = await setup();
        const c = await s.fns.tools.write({ mode: "create", path, content: "v1\n" });
        expect(c.output).toMatch(/^applied: created/);
        expect(c.output).toMatch(/readId: r\w{8} · lines 1-1 of 1 · complete/);
        const again = await s.fns.tools.write({ mode: "create", path, content: "v2\n" });
        expect(again.output).toMatch(/^conflict:/);
        expect(await raw(path)).toBe("v1\n");

        await Bun.write(path, "1\n2\n3\n");
        const part = readId(await s.fns.tools.read({ path, startLine: 1, endLine: 2 }));
        expect((await s.fns.tools.write({ mode: "replace", readId: part, content: "x" })).output).toMatch(/^invalid:.*whole file/);

        const whole = readId(await s.fns.tools.read({ path }));
        await s.fns.files.write({ path, content: "changed\n" });
        const stale = await s.fns.tools.write({ mode: "replace", readId: whole, content: "mine\n" });
        expect(stale.output).toMatch(/^conflict:/);
        expect(await raw(path)).toBe("changed\n");
        const ok = await s.fns.tools.write({ mode: "replace", readId: readId(stale.output), content: "mine\n" });
        expect(ok.output).toMatch(/^applied:/);
        expect(await raw(path)).toBe("mine\n");
    });

    test("legacy write warns", async () => {
        const { s, path } = await setup();
        const r = await s.fns.tools.write({ path, content: "x" });
        expect(r.output).toContain("warning: no mode/readId");
    });
});

describe("tools.call surface", () => {
    test("edit via tools.call with an agent: readId round trip", async () => {
        const { ctx, path } = await setup();
        await Bun.write(path, "a\n");
        const agent = { id: "tc", workspaceDir: process.cwd() };
        const read = await ctx.fns.tools.call({ name: "read", args: { path }, agent });
        const r = await ctx.fns.tools.call({ name: "edit", args: { readId: readId(read.output), mode: "literal", edits: [{ oldText: "a", newText: "b" }] }, agent });
        expect(r.isError).toBe(false);
        expect(r.output).toMatch(/^applied:/);
        const bad = await ctx.fns.tools.call({ name: "edit", args: { mode: "literal", path, edits: [{ oldText: "b", newText: "c" }] }, agent });
        expect(bad.isError).toBe(true);
    });
});

describe("commit lock", () => {
    test("concurrent guarded edits of one version: exactly one applies, none lost", async () => {
        const { s, path } = await setup();
        await Bun.write(path, "a\nb\n");
        const id1 = readId(await s.fns.tools.read({ path }));
        const id2 = readId(await s.fns.tools.read({ path }));
        const [r1, r2] = await Promise.all([
            s.fns.tools.edit({ readId: id1, mode: "literal", edits: [{ oldText: "a", newText: "A" }] }),
            s.fns.tools.edit({ readId: id2, mode: "literal", edits: [{ oldText: "b", newText: "B" }] }),
        ]);
        const statuses = [r1.output, r2.output].map((o: string) => o.split(":")[0]).sort();
        expect(statuses).toEqual(["applied", "conflict"]);
        expect(["A\nb\n", "a\nB\n"]).toContain(await raw(path));
    });

    test("a held lock answers busy with its owner; nothing is written", async () => {
        const { s, path } = await setup();
        await Bun.write(path, "a\n");
        const { realpathSync, mkdirSync, writeFileSync } = await import("node:fs");
        const key = new Bun.CryptoHasher("sha256").update(realpathSync(path)).digest("hex");
        const lock = `${process.cwd()}/${DIR}/locks/${key}`;
        mkdirSync(lock, { recursive: true });
        writeFileSync(`${lock}/owner`, "pid=1 test");
        const err: any = await s.fns.files.write({ path, content: "b\n", lockWaitMs: 100 }).catch((e: any) => e);
        expect(s.fns.files.refusalOf({ error: err })?.code).toBe("busy");
        expect(String(err.message)).toContain("pid=1 test");
        expect(await raw(path)).toBe("a\n");
        await Bun.$`rm -rf ${lock}`.quiet();
        await s.fns.files.write({ path, content: "b\n" });
        expect(await raw(path)).toBe("b\n");
    });
});

describe("several processes", () => {
    test("cooperating writers in separate processes serialize on the lock dir; refused preconditions leave the file intact", async () => {
        const { path } = await setup();
        await Bun.write(path, "0\n");
        const abs = `${process.cwd()}/${path}`;
        const locks = `${process.cwd()}/${DIR}/locks`;
        // Every child writes conditionally on the same base version (computed here,
        // so slow process start-up cannot let a child see a later version): exactly one wins.
        const base = new Bun.CryptoHasher("sha256").update("0\n").digest("hex");
        const script = `
            import { mkTestCtx } from "${process.cwd()}/src/_testCtx.entry";
            const ctx: any = await mkTestCtx({ db: false, env: { MAUZCODE_LOCKS_DIR: ${JSON.stringify(locks)} } });
            try { await ctx.fns.files.write({ path: ${JSON.stringify(abs)}, content: process.argv[2] + "\\n", expectedVersion: ${JSON.stringify(base)}, lockWaitMs: 10000 }); console.log("ok"); }
            catch (e: any) { console.log(ctx.fns.files.refusalOf({ error: e })?.code ?? "error " + e.message); }
            process.exit(0);`;
        const file = `${DIR}/child.ts`;
        await Bun.write(file, script);
        const kids = [1, 2, 3, 4].map(i => Bun.spawn(["bun", file, String(i)], { stdout: "pipe", stderr: "ignore" }));
        const outs = await Promise.all(kids.map(async k => (await new Response(k.stdout).text()).trim().split("\n").at(-1)));
        expect(outs.filter(o => o === "ok")).toHaveLength(1);
        expect(outs.filter(o => o === "conflict")).toHaveLength(3);
        expect(["1\n", "2\n", "3\n", "4\n"]).toContain(await raw(path));
    }, 60000);

    // Known limitation: a writer that does not take the lock (bash, editors)
    // can still land between the check and the rename; the window is only narrowed.
});
