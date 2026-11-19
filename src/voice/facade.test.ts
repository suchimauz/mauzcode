import { expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

// The Voice SDK exposes one minimal public facade. Everything else lives in an implementation namespace, so a
// consumer never has to know the storage layout and never reaches the secret-handling internals by accident.
// The route facade is exactly the two entries the design names: resolveRoute and effectiveRoute.
test("the public voice facade exposes only the minimal entry points", async () => {
    const ctx = await mkTestCtx();
    const voice = ctx.state.registry.voice as Record<string, unknown>;
    const root = Object.entries(voice).filter(([, value]) => typeof value === "function").map(([name]) => name).sort();
    expect(root).toEqual(["create", "effectiveRoute", "get", "list", "providers", "remove", "resolveRoute", "test", "update"]);
    // The storage, route, live-session, error-journal and settings-HTTP internals stay in their own namespaces.
    expect(Object.keys(voice).filter(name => typeof voice[name] === "object").sort()).toEqual(["connections", "http", "journal", "route", "session", "transport"]);
    // The owner-only error journal records, reads and purges; it is reached through settings HTTP and the session core.
    expect(Object.keys(voice.journal as Record<string, unknown>).sort()).toEqual(["purge", "read", "record"]);
    expect(Object.keys(voice.http as Record<string, unknown>)).toEqual(["api"]);
    expect(Object.keys(voice.connections as Record<string, unknown>).sort()).toEqual([
        "create", "get", "list", "remove", "resolve", "test", "toView", "update", "validateConfig",
    ]);
    expect(Object.keys(voice.route as Record<string, unknown>).sort()).toEqual([
        "clearOverride", "effectiveRoute", "failure", "formatRoute", "parseRoute", "resolveRoute", "setOverride",
    ]);
    // The session core is internal: a transport calls open, and the segmentation and error helpers stay here.
    expect(Object.keys(voice.session as Record<string, unknown>).sort()).toEqual([
        "failure", "limits", "message", "open", "vadFlush", "vadPush", "vadState",
    ]);
    // Connection-bound networking is internal too: providers reach it only through ResolvedConnection.
    expect(Object.keys(voice.transport as Record<string, unknown>).sort()).toEqual(["acquire", "fetch", "openWebSocket", "validate"]);
});
