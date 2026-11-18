import { describe, expect, test } from "bun:test";
import resolve from "./codexClientVersion";
import validate from "./codexValidate";
import version from "./codexVersion";
import provider from "../../$modelProvider_codex";

function fixture(value: string | null = "0.160.0") {
    const calls: unknown[] = [];
    const ctx = { fns: { models: { provider: { codex: {
        codexCliVersion: async (opts: unknown) => { calls.push(opts); return value; },
        codexClientVersion: (opts: any) => resolve(ctx as any, null, opts),
    } } } } };
    return { ctx: ctx as any, calls };
}

describe("Codex client version", () => {
    test("default detection is off; overrides and disabled detection never execute commands", async () => {
        const { ctx, calls } = fixture();
        expect(provider.fields.find(f => f.key === "detectCliVersion")).toMatchObject({ default: false });
        expect(await resolve(ctx, null, { config: {} })).toEqual({ version: "0.157.1", source: "default" });
        expect(await resolve(ctx, null, { config: { detectCliVersion: false }, refresh: true })).toEqual({ version: "0.157.1", source: "default" });
        expect(await resolve(ctx, null, { config: { clientVersion: " 0.170.0 ", detectCliVersion: true }, refresh: true })).toEqual({ version: "0.170.0", source: "override" });
        expect(calls).toEqual([]);
    });
    test("reports detection and passes refresh; requests and provider hook use same resolution", async () => {
        const { ctx, calls } = fixture();
        const config = { detectCliVersion: true };
        expect(await resolve(ctx, null, { config, refresh: true })).toEqual({ version: "0.160.0", source: "detected" });
        expect(calls).toEqual([{ refresh: true }]);
        expect(await version(ctx, null, { config })).toBe("0.160.0");
        expect(await provider.clientVersion(ctx, { config } as any, {})).toEqual({ version: "0.160.0", source: "detected" });
    });
    test("older detection is retained with safe detail; missing detection uses default", async () => {
        const { ctx } = fixture("0.98.0");
        expect(await resolve(ctx, null, { config: { detectCliVersion: true } })).toEqual({ version: "0.98.0", source: "detected", detail: "Detected CLI is older than SDK default 0.157.1" });
        expect(await resolve(fixture(null).ctx, null, { config: { detectCliVersion: true } })).toEqual({ version: "0.157.1", source: "default" });
    });
    test("validation rejects incompatible and malformed settings, accepts stored overrides", () => {
        const { ctx } = fixture();
        expect(() => validate(ctx, null, { config: { clientVersion: "0.160.0", detectCliVersion: true } })).toThrow("cannot be combined");
        expect(() => validate(ctx, null, { config: { clientVersion: "bad\nheader" } })).toThrow("Client version");
        expect(() => validate(ctx, null, { config: { clientVersion: "0.160.0" } })).not.toThrow();
        expect(() => validate(ctx, null, { config: { clientVersion: "", detectCliVersion: true } })).not.toThrow();
    });
});
