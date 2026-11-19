import { expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

// The voice namespace holds connections and their credentials. It is classified for the Creator preset only:
// a Standard agent must not be able to read, change or delete a stored voice connection, and it must not be
// able to run a provider check that would use the owner's credentials.
test("the voice namespace is classified in the core catalogue", async () => {
    const ctx = await mkTestCtx();
    const catalogue = ctx.fns.agentPreset.coreCatalogue({});
    expect(catalogue.voice).toEqual({ classification: "creator", patterns: [] });
});

test("Standard may not use the voice namespace and Creator may", async () => {
    const ctx = await mkTestCtx();
    const snapshot = (id: string): types.agentPreset.Snapshot => {
        const preset = ctx.fns.agentPreset.defaults({}).find((entry: any) => entry.id === id)!;
        return {
            presetId: id,
            name: preset.name,
            layers: [{ id, allow: [...preset.allow], plugins: [...preset.plugins], deny: [], prompt: "", excludeSections: [] }],
        };
    };
    const standard = snapshot("standard");
    const creator = snapshot("creator");
    for (const name of ["voice.providers", "voice.list", "voice.get", "voice.create", "voice.update", "voice.remove", "voice.test", "voice.connections.get", "voice.resolveRoute", "voice.effectiveRoute", "voice.route.setOverride", "voice.route.clearOverride"]) {
        expect(ctx.fns.agentPreset.allows({ snapshot: standard, name })).toBe(false);
        expect(ctx.fns.agentPreset.allows({ snapshot: creator, name })).toBe(true);
    }
});
