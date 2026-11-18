import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import detect from "./codexCliVersion";

async function fixture(body: string) {
    const root = resolve(".test-tmp");
    await mkdir(root, { recursive: true });
    const home = await mkdtemp(`${root}/codex-version-`);
    const bin = `${home}/.local/bin`;
    await mkdir(bin, { recursive: true });
    const file = `${bin}/codex`;
    const set = async (text: string) => { await Bun.write(file, text); await chmod(file, 0o755); };
    await set(body);
    const ctx = { state: {}, env: { HOME: home, PATH: bin } } as any;
    return { ctx, home, set, cleanup: () => rm(home, { recursive: true, force: true }) };
}

test("Codex CLI prefixes, cache reuse, refresh, expiry and shared in-flight detection", async () => {
    const f = await fixture('#!/bin/sh\necho x >> "$HOME/count"\necho "codex-cli 0.160.0"\n');
    try {
        expect(await Promise.all([detect(f.ctx, null, {}), detect(f.ctx, null, {}), detect(f.ctx, null, { refresh: true })])).toEqual(["0.160.0", "0.160.0", "0.160.0"]);
        expect(await Bun.file(`${f.home}/count`).text()).toBe("x\n");
        const entry = f.ctx.state.models.codexCliVersions.get("local");
        expect(entry.expires - Date.now()).toBeGreaterThan(290_000);
        await f.set('#!/bin/sh\necho "codex 0.98.0"\n');
        expect(await detect(f.ctx, null, {})).toBe("0.160.0");
        expect(await detect(f.ctx, null, { refresh: true })).toBe("0.98.0");
        f.ctx.state.models.codexCliVersions.get("local").expires = 0;
        await f.set('#!/bin/sh\necho "codex-cli 0.170.0"\n');
        expect(await detect(f.ctx, null, {})).toBe("0.170.0");
    } finally { await f.cleanup(); }
});

test("missing executable, invalid output, nonzero exit and output cap are negative-cached", async () => {
    for (const body of ['#!/does-not-exist/codex-test\n', '#!/bin/sh\necho secret-invalid\n', '#!/bin/sh\necho "codex 0.160.0"\nexit 1\n', '#!/bin/sh\ni=0; while [ "$i" -lt 4200 ]; do printf x; i=$((i+1)); done\n']) {
        const f = await fixture(body);
        try {
            expect(await detect(f.ctx, null, {})).toBeNull();
            const entry = f.ctx.state.models.codexCliVersions.get("local");
            expect(entry.expires - Date.now()).toBeGreaterThan(25_000);
            expect(entry.expires - Date.now()).toBeLessThanOrEqual(30_000);
            expect(entry.pending).toBeUndefined();
            await f.set('#!/bin/sh\necho "codex-cli 0.170.0"\n');
            expect(await detect(f.ctx, null, {})).toBeNull();
            expect(await detect(f.ctx, null, { refresh: true })).toBe("0.170.0");
        } finally { await f.cleanup(); }
    }
});

test("hanging CLI ignores soft timeout but is killed at hard deadline", async () => {
    const f = await fixture('#!/bin/sh\necho $$ > "$HOME/pid"\ntrap "" TERM\nwhile :; do :; done\n');
    try {
        const start = Date.now();
        expect(await detect(f.ctx, null, {})).toBeNull();
        expect(Date.now() - start).toBeGreaterThanOrEqual(11_500);
        expect(Date.now() - start).toBeLessThan(15_000);
        const pid = Number(await Bun.file(`${f.home}/pid`).text());
        expect(() => process.kill(pid, 0)).toThrow();
        expect(await detect(f.ctx, null, {})).toBeNull();
    } finally { await f.cleanup(); }
}, 20_000);
