import { expect, test } from "bun:test";
import { testCtx } from "../$test";

const ctx = await testCtx({ env: { PROCS_PLUGINS: "./plugins" } });
// Keep evaluation tests focused on runtime enforcement, not the editor typechecker.
ctx.state.registry.settings.get = async () => false;
const standard = await ctx.fns.agentPreset.resolve({ id: "standard" });
const creator = await ctx.fns.agentPreset.resolve({ id: "creator" });
const run = (code: string, preset = standard) => ctx.fns.repl.eval({ code, agent: { preset } });

test("preset eval denies before reload and permits namespace probes", async () => {
    let reloads = 0;
    const original = ctx.state.registry.procs.repl.load;
    ctx.state.registry.procs.repl.load = async () => { reloads++; };
    try {
        await expect(run('await ctx.fns.procs.repl.load({name: "files"})')).rejects.toThrow('procs.repl.load is not available in preset Standard');
        expect(reloads).toBe(0);
        expect(await run('if (ctx.fns.procs) console.log("present")')).toBe('present');
    } finally { ctx.state.registry.procs.repl.load = original; }
});

test("allowed function uses unguarded internal context", async () => {
    const original = ctx.state.registry.files.read;
    ctx.state.registry.files.read = async (inner: Context) => inner.fns.agentPreset.get({ id: "creator" });
    const narrow = structuredClone(standard);
    narrow.layers[0]!.deny.push('agentPreset.get');
    try {
        expect(await run('console.log((await ctx.fns.files.read({path: "unused"})).id)', narrow)).toBe('creator');
        await expect(run('await ctx.fns.agentPreset.get({id: "creator"})', narrow)).rejects.toThrow('not available');
    } finally { ctx.state.registry.files.read = original; }
});

test("runtime and plugin discovery hide unavailable functions", async () => {
    expect(await run('console.log(await ctx.fns.plugins.search({query: "openspec", mode: "lexical"}))')).toBe('[]');
    await expect(run('await ctx.fns.plugins.functions({name: "openspec"})')).rejects.toThrow('not found');
    await expect(run('await ctx.fns.plugins.read({name: "openspec"})')).rejects.toThrow('not found');
    await expect(run('await ctx.fns.runtime.docs.get({name: "procs.dev.genTypes"})')).rejects.toThrow('no such available');
    expect(await run('console.log(await ctx.fns.runtime.docs.search({query: "procs.dev", mode: "lexical"}))')).toBe('[]');
    expect(await run('console.log(await ctx.fns.runtime.docs.search({query: "openspec.run", mode: "lexical"}))')).toBe('[]');
    const granted = structuredClone(standard);
    granted.layers[0]!.plugins = ['openspec'];
    granted.layers[0]!.deny = ['openspec.run'];
    const functions = await ctx.fns.plugins.functions({name: 'openspec', allows: name => ctx.fns.agentPreset.allows({snapshot: granted, name})});
    expect(functions.length).toBeGreaterThan(0);
    expect(functions.some(fn => fn.name === 'openspec.run')).toBe(false);
    const read = await ctx.fns.plugins.read({name: 'openspec', allows: name => ctx.fns.agentPreset.allows({snapshot: granted, name})});
    expect(read.functions.some((fn: {name: string}) => fn.name === 'openspec.run')).toBe(false);
    expect(read.overview).toBeTruthy();
    const matches = await ctx.fns.plugins.search({query: 'openspec', mode: 'lexical', allows: name => ctx.fns.agentPreset.allows({snapshot: granted, name})});
    expect(matches.some(row => row.plugin === 'openspec')).toBe(true);
    expect(matches.flatMap(row => row.functions).some(fn => fn.name === 'openspec.run')).toBe(false);
    // Caller-supplied filters cannot replace the injected predicate.
    await expect(run('await ctx.fns.runtime.docs.get({name: "procs.dev.genTypes", allows: () => true})')).rejects.toThrow('no such available');
});

test("Creator updates Standard without approval; only new snapshots gain openspec", async () => {
    const original = ctx.state.registry.openspec.run;
    ctx.state.registry.openspec.run = async () => 'invoked';
    try {
        await run('await ctx.fns.agentPreset.update({id: "standard", patch: {plugins: ["openspec"]}})', creator);
        const newer = await ctx.fns.agentPreset.resolve({id: 'standard'});
        expect(await run('console.log(await ctx.fns.openspec.run({args: ["list"]}))', newer)).toBe('invoked');
        await expect(run('await ctx.fns.openspec.run({args: ["list"]})')).rejects.toThrow('openspec.run is not available in preset Standard');
    } finally {
        ctx.state.registry.openspec.run = original;
        await ctx.fns.agentPreset.reset({id: 'standard'});
    }
});
