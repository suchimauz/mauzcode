/**
 * Wire driver that maps the shared provider-contract scenarios onto native Deepgram `/v1/listen` events.
 *
 * Deepgram results carry no phrase id, so the driver names each commit by its Finalize index and sends `Results`
 * whose `start`/`duration` cover exactly the audio the fake server received before that Finalize. It never
 * touches `session.emit` and never replaces the adapter's stream. The connection resolves lazily, because the
 * contract calls `setup` before it opens the session.
 */
import { BYTES_PER_SECOND, results } from "./deepgramFake.entry";
import type { FakeConnection, FakeDeepgramServer } from "./deepgramFake.entry";
import type { ContractUpstream } from "./providerContract.entry";

/** Audio range of the indexed commit in stream seconds, from the bytes received around its Finalize. */
function span(conn: FakeConnection, index: number): { start: number; duration: number } {
    const start = index === 0 ? 0 : conn.bytesBeforeFinalize(index - 1) / BYTES_PER_SECOND;
    const end = conn.bytesBeforeFinalize(index) / BYTES_PER_SECOND;
    return { start, duration: end - start };
}

/** Build a contract upstream driver over the first connection of one fake server. */
export function deepgramUpstream(server: FakeDeepgramServer): ContractUpstream {
    const connection: Promise<FakeConnection> = server.next(0);
    // Scenarios that never touch the upstream may close before the lazy wait sees the socket; keep it handled.
    connection.catch(() => {});
    let closedObserved = false;
    return {
        acceptCommit: async index => {
            const conn = await connection;
            await conn.waitReceived("Finalize", index + 1);
            return String(index);
        },
        reportTurn: async () => {
            throw new Error("deepgram declares client turn detection; reportTurn must not be used");
        },
        revise: async (id, text) => {
            const conn = await connection;
            const { start, duration } = span(conn, Number(id));
            await conn.send(results(text, start, duration));
        },
        finalize: async (id, text) => {
            const conn = await connection;
            if (!conn.isOpen()) return;
            const { start, duration } = span(conn, Number(id));
            await conn.send(results(text, start, duration, { isFinal: true, fromFinalize: true }));
        },
        failPhrase: async () => {
            throw new Error("deepgram has no per-phrase failure event");
        },
        disconnect: async () => {
            const conn = await connection;
            conn.terminate();
            await conn.clientClosed;
            closedObserved = true;
        },
        expectClosed: async () => {
            const conn = await connection;
            if (!closedObserved) await conn.closed;
            closedObserved = true;
        },
    };
}
