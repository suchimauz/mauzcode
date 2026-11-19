/**
 * Reusable fixture that drives the real session core with a fake provider.
 *
 * Both the shared provider contract suite and the session tests need the same thing: a migrated test ctx, one
 * registered provider declaration whose `open` returns a scriptable recorder, one stored connection and the exact
 * route string for it. Keeping that in one file means a provider added later is tested by the same code, and a test
 * never has to hand-build a registry or reach into storage.
 *
 * Nothing here uses a network, a real key or a file: the connection secret is a fixed fake value and every provider
 * behavior is scripted through the recorder.
 */
import { mkTestCtx } from "../../_testCtx.entry";
import { createContractRecorder } from "./contractRecorder.entry";
import type { ContractRecorder } from "./contractRecorder.entry";

/** Options for one fake provider fixture. */
export type SessionFixtureOptions = {
    /** Provider id; must be lowercase kebab-case and match the declaration filename. */
    providerId: string;
    /** Turn detection the single declared model advertises. @default client */
    turnDetection?: "client" | "server";
    /** Sample rates the model accepts; the first is negotiated. @default [24000] */
    sampleRates?: number[];
    /** Make `open` reject with this error instead of resolving, to test route/provider failures. */
    openError?: { code: string; message: string };
    /** Optional hook for a test to delay or fail provider opening or wrap individual stream methods. */
    wrapOpen?: (stream: types.voice.VoiceStream, session: types.voice.StreamSession) => Promise<types.voice.VoiceStream>;
};

/** One ready fixture: a registered provider, a stored connection and its route. */
export type SessionFixture = {
    /** Fresh test ctx with the provider registered and the connection stored. */
    ctx: any;
    /** Exact `<provider>/<account>:<model>` route of the stored connection. */
    route: string;
    /** Scriptable transport the provider's `open` returns. */
    recorder: ContractRecorder;
    /** How many times core opened a provider stream. */
    opened: () => number;
};

/** Fixed fake credential: never a real key, and never expected to appear in an event or an error. */
export const FIXTURE_SECRET = "fixture-voice-secret-0123456789";

/**
 * Build one fake provider fixture.
 *
 * Use at the start of a session or contract test. The declaration follows the SDK contract exactly — fields, models
 * with capabilities, a `test` that sends no audio and an `open` that returns the recorder — so core exercises its real
 * validation, connection resolution and route resolution rather than a stub.
 */
export async function createSessionFixture(opts: SessionFixtureOptions): Promise<SessionFixture> {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString("base64") } });
    const recorder = createContractRecorder();
    let opened = 0;
    const sampleRates = opts.sampleRates ?? [24000];
    const definition: types.voice.ProviderDefinition = {
        id: opts.providerId,
        label: "Fixture Voice",
        description: "Fixture recognizer",
        destination: { kind: "cloud", label: "Fixture (fixture.invalid)" },
        fields: [{ key: "apiKey", label: "API key", type: "secret", required: true }],
        models: [{
            id: "fixture-live",
            label: "Fixture Live",
            capabilities: { turnDetection: opts.turnDetection ?? "client", sampleRates },
        }],
        test: async () => ({ status: "available", reason: "voice-ok", message: "Fixture ready", checkedAt: 1 }),
        open: async (_ctx, _conn, session) => {
            opened++;
            if (opts.openError) {
                throw Object.assign(new Error(opts.openError.message), { code: opts.openError.code });
            }
            const stream = recorder.stream(session);
            return opts.wrapOpen ? await opts.wrapOpen(stream, session) : stream;
        },
    };
    ctx.state.voice ??= {};
    ctx.state.voice.providers = {
        [opts.providerId]: {
            owner: "core",
            module: "voice",
            rel: `voice/$voiceProvider_${opts.providerId}.ts`,
            abs: `/app/src/voice/$voiceProvider_${opts.providerId}.ts`,
            definition,
        },
    };
    const created = await ctx.fns.voice.create({
        provider: opts.providerId,
        accountName: "work",
        config: {},
        secrets: { apiKey: FIXTURE_SECRET },
    });
    return {
        ctx,
        route: `${opts.providerId}/work:fixture-live`,
        recorder,
        opened: () => opened,
    };
}

/** Speech and silence PCM16 at one rate, for segmentation tests. */
export function tone(sampleRate: number) {
    return {
        /** `windows` of 20 ms at full-scale-ish speech energy. */
        speech: (windows: number): Uint8Array => shaped(sampleRate, windows, 0.5),
        /** `windows` of 20 ms digital silence. */
        silence: (windows: number): Uint8Array => shaped(sampleRate, windows, 0),
        /** `windows` of 20 ms at a given amplitude, for quietest-window assertions. */
        shaped: (windows: number, amplitude: number): Uint8Array => shaped(sampleRate, windows, amplitude),
    };
}

/** Build deterministic mono PCM16: a square wave of the given amplitude, or silence. */
function shaped(sampleRate: number, windows: number, amplitude: number): Uint8Array {
    const windowMs = 20;
    const samples = Math.round((sampleRate * windowMs) / 1000) * windows;
    const bytes = new Uint8Array(samples * 2);
    const peak = Math.round(Math.max(0, Math.min(1, amplitude)) * 32767);
    for (let index = 0; index < samples; index++) {
        const value = peak === 0 ? 0 : (Math.floor(index / 8) % 2 === 0 ? peak : -peak);
        const signed = value < 0 ? value + 0x10000 : value;
        bytes[index * 2] = signed & 0xff;
        bytes[index * 2 + 1] = (signed >> 8) & 0xff;
    }
    return bytes;
}
