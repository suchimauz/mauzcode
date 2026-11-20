// Headless Chrome for the test environment — never the developer's browser, never a local install.
//
// Chrome runs from a pinned Docker image (IMAGE below), so a browser test behaves the same on every
// machine and needs nothing but Docker. The container shares the host network: Chrome reaches the
// test's own servers on 127.0.0.1, and the test reaches Chrome's DevTools port on 127.0.0.1.
// Without Docker (or with MAUZCODE_SKIP_DOCKER_TESTS=1) both helpers return null and browser suites
// skip — like the SSH suites in test/ssh/.
//
// testChrome(): one shared Chrome for the whole suite on a fixed port (TEST_CHROME_PORT, default
// 59222). The first worker to need it starts the container; the others (and later runs) find it
// answering and reuse it, like mauzcode-db-test. Every test ctx gets its address as CDP_BROWSER_URL
// (see src/$test.ts and the test preload), so code that talks to "the browser" in a test talks to
// this one. When it is unavailable the URL points nowhere, so nothing falls back to :9222.
//
// startHeadlessChrome(): a private throwaway container (random port) for a test that wants a browser
// of its own; stop() removes it.

import { createServer } from "node:net";
import { resolve } from "node:path";

/** chromedp/headless-shell 159.0.8154.13, pinned by digest. */
const IMAGE = "chromedp/headless-shell@sha256:381353d3530ab9d579d2fe8b9c0f4519c995617f5a71daf6bb649e2d12005bd9";
const CHECKOUT = resolve(import.meta.dir, "../..");
// Stable per checkout, so two checkouts never share or kill each other's browser.
const SHARED_NAME = `mauzcode-test-chrome-${Bun.hash(CHECKOUT).toString(36).slice(0, 8)}`;

const FLAGS = ["--no-sandbox", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-gpu",
    "--disable-background-networking", "--disable-sync", "--mute-audio", "--disable-dev-shm-usage",
    "--remote-debugging-address=127.0.0.1"];

/** Where tests reach Chrome when there is none: refused at once, never the developer's :9222. */
export const NO_CHROME_URL = "http://127.0.0.1:1";

const up = (url: string) => fetch(`${url}/json/version`, { signal: AbortSignal.timeout(1000) }).then(r => r.ok, () => false);

async function sh(cmd: string[]): Promise<{ code: number; out: string; err: string }> {
    try {
        const p = Bun.spawn({ cmd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
        const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
        return { code, out, err };
    } catch (e) {
        return { code: 127, out: "", err: String(e) };
    }
}

let docker: Promise<boolean> | undefined;
/** Docker is the only prerequisite; the image is pulled on first use. */
function dockerReady(): Promise<boolean> {
    return docker ??= (async () => {
        if (process.env.MAUZCODE_SKIP_DOCKER_TESTS === "1") return false;
        if ((await sh(["docker", "info", "--format", "{{.ServerVersion}}"])).code !== 0) return false;
        if ((await sh(["docker", "image", "inspect", IMAGE])).code === 0) return true;
        const pull = await sh(["docker", "pull", "-q", IMAGE]);
        if (pull.code !== 0) console.warn(`[test-chrome] cannot pull ${IMAGE}: ${pull.err.trim().slice(-300)}`);
        return pull.code === 0;
    })();
}

/** Whether browser suites can run here (Docker up, image present or pulled). Suites skip when false. */
export async function browserTestsEnabled(): Promise<boolean> {
    const ok = await dockerReady();
    if (!ok) console.warn("[test-chrome] Docker unavailable or MAUZCODE_SKIP_DOCKER_TESTS=1 — browser suites skipped");
    return ok;
}

/** Run Chrome in a container on the host network; returns the container id or null. */
async function run(name: string | null, port: number): Promise<string | null> {
    const r = await sh(["docker", "run", "-d", "--rm", "--network", "host", "--shm-size", "512m",
        ...(name ? ["--name", name, "--label", "mauzcode.test=chrome"] : ["--label", "mauzcode.test=chrome-private"]),
        "--entrypoint", "/headless-shell/headless-shell", IMAGE, ...FLAGS, `--remote-debugging-port=${port}`, "about:blank"]);
    return r.code === 0 ? r.out.trim() : null;
}

async function waitUp(url: string, ms: number): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await up(url)) return true;
        await Bun.sleep(50);
    }
    return false;
}

let shared: Promise<string | null> | undefined;

export function testChrome(): Promise<string | null> {
    return shared ??= (async () => {
        const port = Number(process.env.TEST_CHROME_PORT) || 59222;
        const url = `http://127.0.0.1:${port}`;
        if (await up(url)) return url;
        if (!(await dockerReady())) return null;
        // Two workers may race here: the loser's `docker run` fails on the taken name; both then see the
        // winner answer. A stopped leftover with the same name is removed first.
        await sh(["docker", "rm", "-f", SHARED_NAME]);
        await run(SHARED_NAME, port);
        return (await waitUp(url, 20_000)) ? url : null;
    })();
}

export type HeadlessChrome = { url: string; stop: () => Promise<void> };

/** A free loopback TCP port, chosen by the kernel. */
function freePort(): Promise<number> {
    return new Promise((ok, fail) => {
        const server = createServer();
        server.once("error", fail);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address() as { port: number };
            server.close(() => ok(port));
        });
    });
}

export async function startHeadlessChrome(): Promise<HeadlessChrome | null> {
    if (!(await dockerReady())) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
        const port = await freePort();
        const id = await run(null, port);
        if (!id) continue;
        const stop = async () => { await sh(["docker", "rm", "-f", id]); };
        const url = `http://127.0.0.1:${port}`;
        if (await waitUp(url, 20_000)) return { url, stop };
        await stop();
    }
    return null;
}
