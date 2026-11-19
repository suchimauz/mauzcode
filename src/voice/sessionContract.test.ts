import { expect } from "bun:test";
import { runVoiceProviderContract } from "./contract/providerContract.entry";
import type { ContractFixture } from "./contract/providerContract.entry";
import { createSessionFixture } from "./contract/sessionFixture.entry";

// The in-process fixture maps the shared upstream scenarios to normalized events. When the real adapter lands,
// its driver must inject wire messages instead, and observe append/commit/close on the fake upstream.
async function setup(turnDetection: "client" | "server"): Promise<ContractFixture> {
    const { ctx, route, recorder } = await createSessionFixture({ providerId: `fixture-${turnDetection}`, turnDetection });
    const ids = new Map<string, { order: number } | { turnId: string }>();
    const key = (id: string) => {
        const bound = ids.get(id);
        if (!bound) throw new Error("unexpected fixture phrase id");
        return bound;
    };
    let finished = false;
    // The fake's successful finish owns its release. Abnormal release goes through recorder.cancel().
    const provider = ctx.state.voice.providers[`fixture-${turnDetection}`].definition as types.voice.ProviderDefinition;
    const open = provider.open;
    provider.open = async (...args) => {
        const stream = await open(...args);
        return {
            ...stream,
            finish: async () => { await stream.finish(); finished = true; },
        };
    };
    return {
        ctx, route,
        upstream: {
            acceptCommit: async index => {
                // Starting finish schedules its flush inside the queue; wait one turn for in-process I/O.
                await new Promise<void>(resolve => setImmediate(resolve));
                const order = recorder.commits[index];
                expect(order).toBeDefined();
                const id = `manual-${index}`;
                ids.set(id, { order: order! });
                return id;
            },
            reportTurn: async endByte => {
                const turnId = `auto-${100 - ids.size}`;
                recorder.emit({ type: "committed", turnId, endByte });
                ids.set(turnId, { turnId });
                return turnId;
            },
            revise: async (id, text) => recorder.emit({ type: "revision", ...key(id), text }),
            finalize: async (id, text) => recorder.emit({ type: "final", ...key(id), text }),
            failPhrase: async id => recorder.emit({ type: "failed", ...key(id), message: "fixture upstream failure" }),
            disconnect: async () => recorder.fail("provider"),
            expectClosed: async () => expect(finished || recorder.cancels === 1).toBe(true),
        },
    };
}

for (const mode of ["client", "server"] as const) {
    runVoiceProviderContract({ name: `fixture ${mode}-turn`, setup: () => setup(mode) });
}
