// Routed voice transports end to end, in a child process that trusts a throwaway CA (NODE_EXTRA_CA_CERTS is read
// at startup, so the production verifier of this process stays untouched). A local SOCKS5 proxy records every
// destination it is asked to dial; a fake SSH tunnel counts its leases. Skipped without openssl.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const openssl = Bun.which("openssl");
let dir = "";
let r: Record<string, any> = {};

function sh(args: string[]) {
    const out = Bun.spawnSync(args, { cwd: dir, stdout: "ignore", stderr: "pipe" });
    if (out.exitCode !== 0) throw new Error(`${args[0]} failed: ${out.stderr.toString()}`);
}

beforeAll(async () => {
    if (!openssl) return;
    dir = mkdtempSync(join(tmpdir(), "voice-route-it-"));
    sh([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=mauzcode-voice-test-ca"]);
    sh([openssl, "req", "-newkey", "rsa:2048", "-nodes", "-keyout", "srv.key", "-out", "srv.csr", "-subj", "/CN=voice.test"]);
    writeFileSync(join(dir, "ext"), "subjectAltName=DNS:voice.test,DNS:localhost\n");
    sh([openssl, "x509", "-req", "-in", "srv.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "srv.pem", "-days", "1", "-extfile", "ext"]);
    const child = Bun.spawn([process.execPath, join(import.meta.dir, "transport/routeHarness.entry.ts"), join(dir, "srv.key"), join(dir, "srv.pem")], {
        env: { ...process.env, NODE_EXTRA_CA_CERTS: join(dir, "ca.pem") }, stdout: "pipe", stderr: "pipe",
    });
    const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    const line = out.trim().split("\n").pop() ?? "";
    if (!line.startsWith("{")) throw new Error("harness failed: " + err.slice(-2000));
    r = JSON.parse(line);
}, 60_000);
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const routed = ["socks", "ssh-tunnel"] as const;
const sshCleanup = (o: any) => { expect(o.releases).toBe(o.leases); };

test.skipIf(!openssl)("HTTP discovery travels over the selected path with the destination host", () => {
    expect(r["direct.http"]).toMatchObject({ status: 200, dials: [], leases: 0 });
    for (const kind of routed) {
        expect(r[`${kind}.http`]).toMatchObject({ status: 200, host: expect.stringMatching(/^voice\.test:\d+$/), dials: [expect.stringMatching(/^voice\.test:\d+$/)] });
    }
    expect(r["ssh-tunnel.http"]).toMatchObject({ leases: 1, releases: 1 });
    expect(r["socks.http"].leases).toBe(0);
});

test.skipIf(!openssl)("WSS upgrade and frames use the same routed stream, one dial each", () => {
    expect(r["direct.ws"]).toMatchObject({ opened: true, code: 1000, dials: [] });
    expect(JSON.parse(r["direct.ws"].messages[0])).toEqual({ echo: { hello: 1 } });
    for (const kind of routed) {
        const o = r[`${kind}.ws`];
        expect(o).toMatchObject({ opened: true, code: 1000, destinationHits: 1 });
        expect(o.dials).toEqual([expect.stringMatching(/^voice\.test:\d+$/)]);
        expect(JSON.parse(o.messages[0])).toEqual({ echo: { hello: 1 } });
    }
    sshCleanup(r["ssh-tunnel.ws"]);
    expect(r["ssh-tunnel.ws"].leases).toBe(1);
});

test.skipIf(!openssl)("redirects are refused for requests and upgrades, never followed or retried directly", () => {
    for (const kind of ["direct", ...routed]) {
        expect(r[`${kind}.httpRedirect`].error).toMatchObject({ code: "TRANSPORT" });
        expect(r[`${kind}.httpRedirect`].destinationHits).toBe(1);
        const ws = r[`${kind}.wsRedirect`];
        expect(ws.opened).toBe(false);
        expect(ws.error).toMatch(/Expected 101 status code: 302$/);
        expect(ws.error).not.toContain("elsewhere");
        expect(ws.destinationHits).toBe(1);
    }
    for (const kind of routed) expect(r[`${kind}.wsRedirect`].dials.length).toBe(1);
    sshCleanup(r["ssh-tunnel.httpRedirect"]);
    sshCleanup(r["ssh-tunnel.wsRedirect"]);
});

test.skipIf(!openssl)("TLS identity is verified for the destination host over a route", () => {
    for (const kind of routed) {
        const o = r[`${kind}.tls`];
        expect(o.ws).toMatchObject({ opened: false, code: 1006, error: "TLS verification or handshake failed" });
        expect(o.http).toMatchObject({ code: "TRANSPORT" });
        expect(o.dials.every((d: string) => d.startsWith("wrong.test:"))).toBe(true);
    }
    sshCleanup(r["ssh-tunnel.tls"]);
});

test.skipIf(!openssl)("a broken or stale route fails closed without contacting the destination", () => {
    for (const key of ["socks.refused", "socks.missing", "ssh.missing"]) {
        expect(r[key].ws).toMatchObject({ opened: false, code: 1006 });
        expect(r[key].destinationHits).toBe(0);
        expect(r[key].dials).toEqual([]);
    }
    expect(r["socks.refused"].http).toMatchObject({ code: "TRANSPORT" });
});

test.skipIf(!openssl)("abort, deadline, late lease and completion release the tunnel exactly once", () => {
    expect(r["ssh.abortSetup"]).toMatchObject({ opened: false, code: 1006, error: "Voice transport cancelled", leases: 1, releases: 1, destinationHits: 0 });
    expect(r["ssh.timeout"]).toMatchObject({ opened: false, code: 1006, error: "Voice WebSocket setup timed out", leases: 1, releases: 1 });
    expect(r["ssh.lateLease"]).toMatchObject({ opened: false, leases: 1, releases: 1, destinationHits: 0 });
    expect(r["ssh.abortOpen"]).toMatchObject({ code: 1006, leases: 1, releases: 1 });
    expect(r["ssh.fetchAbort"]).toMatchObject({ error: { code: "TRANSPORT" }, leases: 1, releases: 1 });
});

test.skipIf(!openssl)("OpenAI Realtime checks and dictates over each route to a custom endpoint", () => {
    for (const kind of ["direct", ...routed]) {
        const o = r[`${kind}.openai`];
        expect(o.check).toEqual({ status: "available", reason: "voice-ok" });
        // The check waits for transcription confirmation and never appends audio.
        expect(o.checkWire).toEqual([{ path: "/custom/v1/realtime?intent=transcription", auth: true, types: ["session.update"] }]);
        expect(o.live.finals).toEqual(["routed hello"]);
        expect(o.live.types).toEqual(["session.update", "input_audio_buffer.append", "input_audio_buffer.commit"]);
        if (kind === "direct") expect(o.dials).toEqual([]);
        else expect(o.dials.length).toBe(2);
    }
    expect(r["ssh-tunnel.openai"]).toMatchObject({ leases: 2, releases: 2 });
});

test.skipIf(!openssl)("a broken route fails the OpenAI check and live handshake with redacted errors", () => {
    const o = r["openai.brokenRoute"];
    expect(o.check).toMatchObject({ status: "unavailable", reason: "unreachable" });
    expect(o.liveError).toEqual({ code: "provider", message: "OpenAI Realtime transcription failed." });
    expect(o.destinationHits).toBe(0);
    expect(JSON.stringify(o)).not.toContain("fake-route-voice-key");
});
