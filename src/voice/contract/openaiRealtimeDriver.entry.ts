/**
 * Wire driver that maps the shared provider-contract scenarios onto native OpenAI Realtime events.
 *
 * The contract suite must run against the real adapter's real WebSocket client, so this driver never touches
 * `session.emit` and never replaces the adapter's stream: it waits for messages the fake server actually
 * received and sends the native events the service would send. Item ids are provider-shaped (`item_<n>`),
 * deliberately different from normalized core orders. The connection resolves lazily: the contract calls
 * `setup` before it opens the session, so awaiting the socket inside `setup` would deadlock. The fake
 * auto-confirms `session.update`; every wait is bounded by the fake server.
 */
import { committed, transcription } from "./openaiRealtimeFake.entry";
import type { FakeConnection, FakeRealtimeServer } from "./openaiRealtimeFake.entry";
import type { ContractUpstream } from "./providerContract.entry";

/** Build a contract upstream driver over the first connection of one fake server. */
export function realtimeUpstream(server: FakeRealtimeServer): ContractUpstream {
    const connection: Promise<FakeConnection> = server.next(0);
    const tails = new Map<string, string>();
    let acknowledged = 0;
    let closedObserved = false;
    return {
        acceptCommit: async index => {
            const conn = await connection;
            await conn.waitReceived("input_audio_buffer.commit", index + 1);
            const id = `item_${acknowledged}`;
            const previous = acknowledged === 0 ? null : `item_${acknowledged - 1}`;
            acknowledged++;
            await conn.send(committed(id, previous));
            return id;
        },
        reportTurn: async () => {
            throw new Error("openai-realtime declares client turn detection; reportTurn must not be used");
        },
        revise: async (id, text) => {
            const conn = await connection;
            // The wire carries deltas; the adapter accumulates them into full revisions. Send the missing tail.
            const sent = tails.get(id) ?? "";
            if (!text.startsWith(sent)) throw new Error("contract revision is not an extension of the sent deltas");
            tails.set(id, text);
            await conn.send(transcription("delta", id, { delta: text.slice(sent.length) }));
        },
        finalize: async (id, text) => {
            const conn = await connection;
            // A duplicate final for a settled item is dropped by the adapter; after closure there is no socket.
            if (!conn.isOpen()) return;
            await conn.send(transcription("completed", id, { transcript: text }));
        },
        failPhrase: async id => {
            const conn = await connection;
            await conn.send(transcription("failed", id, { error: { type: "transcription_error" } }));
        },
        disconnect: async () => {
            const conn = await connection;
            // An abrupt drop, as a real network failure. Wait until the client demonstrably processed it,
            // not just the server-side close callback: otherwise finish can race the client close event.
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
