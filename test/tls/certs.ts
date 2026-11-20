// Throwaway TLS material for integration tests: a one-day CA and one server certificate it signs.
//
// openssl runs from a small Docker image built from test/tls/Dockerfile (tag derived from the
// Dockerfile, built on first use and reused), never from the host: a test must not depend on what
// is installed on the developer's machine. The container runs as the caller's uid with only the
// output directory mounted. Without Docker (or with MAUZCODE_SKIP_DOCKER_TESTS=1) tlsFixtureEnabled()
// is false and the suite skips.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HERE = import.meta.dir;
const TAG = `mauzcode-test-openssl:${Bun.hash(readFileSync(join(HERE, "Dockerfile"), "utf8")).toString(36)}`;

function run(cmd: string[]): { code: number; err: string } {
    try {
        const r = Bun.spawnSync(cmd, { stdin: "ignore", stdout: "ignore", stderr: "pipe" });
        return { code: r.exitCode ?? 1, err: r.stderr.toString() };
    } catch (e) {
        return { code: 127, err: String(e) };
    }
}

let ready: boolean | undefined;
/** Docker is up and the openssl image exists (built here on first use). */
export function tlsFixtureEnabled(): boolean {
    if (ready !== undefined) return ready;
    if (process.env.MAUZCODE_SKIP_DOCKER_TESTS === "1" || run(["docker", "info", "--format", "{{.ServerVersion}}"]).code !== 0) {
        console.warn("[test-tls] Docker unavailable or MAUZCODE_SKIP_DOCKER_TESTS=1 — TLS suites skipped");
        return ready = false;
    }
    if (run(["docker", "image", "inspect", TAG]).code !== 0) {
        const build = run(["docker", "build", "-q", "-t", TAG, HERE]);
        if (build.code !== 0) throw new Error("cannot build the openssl test image: " + build.err.slice(-1000));
    }
    return ready = true;
}

/**
 * Writes ca.key/ca.pem (CA) and srv.key/srv.pem (server, signed by the CA) into `dir`.
 * @param dir Existing directory to write into.
 * @param cn Server certificate common name.
 * @param altNames DNS subjectAltNames of the server certificate.
 */
export function issueServerCert(dir: string, cn: string, altNames: string[]): void {
    if (!tlsFixtureEnabled()) throw new Error("TLS fixture unavailable (no Docker)");
    const uid = process.getuid?.() ?? 1000, gid = process.getgid?.() ?? 1000;
    const openssl = (...args: string[]) => {
        const r = run(["docker", "run", "--rm", "--network", "none", "-u", `${uid}:${gid}`, "-v", `${dir}:/work`, "-w", "/work", TAG, ...args]);
        if (r.code !== 0) throw new Error(`openssl ${args[0]} failed: ${r.err}`);
    };
    writeFileSync(join(dir, "ext"), `subjectAltName=${altNames.map(name => `DNS:${name}`).join(",")}\n`);
    openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=mauzcode-test-ca");
    openssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "srv.key", "-out", "srv.csr", "-subj", `/CN=${cn}`);
    openssl("x509", "-req", "-in", "srv.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "srv.pem", "-days", "1", "-extfile", "ext");
}
