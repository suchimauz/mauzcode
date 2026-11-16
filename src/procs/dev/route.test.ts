// The url is the input and the file is the output — the whole point being that
// nobody has to remember the grammar in the other direction.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testCtx } from "../../$test";

const ctx = await testCtx();
// mauzcode: route authoring tests must not reload the host registry. reload walks
// prototypes to the root ctx, so WORKDIR (or a fork's state.root) alone cannot
// isolate its genTypes write. Stub this boundary on this file's private registry.
let reloads = 0;
ctx.state.registry.procs.modules.reload = async () => { reloads++; return []; };
const declarations = join(ctx.fns.procs.project.projectRoot({}), "src/ctx_ns.d.ts");
const declarationHash = async () => createHash("sha256").update(new Uint8Array(await Bun.file(declarations).arrayBuffer())).digest("hex");

function project() {
    const dir = mkdtempSync(join(tmpdir(), "route-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    const run = ctx.fns.procs.env.fork({ mode: "test", env: { ...ctx.env, WORKDIR: dir } });
    run.state.root = dir;
    return { dir, run };
}

test("a url becomes the folders it is, with :params as $folders", async () => {
    const { dir, run } = project();
    const before = await declarationHash();
    const callsBefore = reloads;
    expect(run.fns.procs.project.projectRoot({})).toBe(dir);
    expect(run.fns.procs.project.workdir({})).toBe(dir);
    const made = await run.fns.procs.dev.route({ url: "/ehr/patient/:id/cardio/summary" });

    expect(made.file).toBe("src/ehr/patient/$id/cardio/summary/$route__GET.ts");
    const source = await Bun.file(join(dir, made.file)).text();
    expect(source).toContain("GET /ehr/patient/:id/cardio/summary");
    expect(source).toContain("ctx.fns.procs.ui.page");

    // …and the POST beside it is the same address with its own file.
    const posted = await run.fns.procs.dev.route({ url: "/ehr/patient/:id/cardio/summary", method: "post" });
    expect(posted.file).toBe("src/ehr/patient/$id/cardio/summary/$route__POST.ts");
    expect(await Bun.file(join(dir, posted.file)).text()).toContain("answer with the fragment you changed");
    expect(reloads - callsBefore).toBe(2);
    expect(await declarationHash()).toBe(before);
});

test("it refuses what it cannot write, and what already answers", async () => {
    const { run } = project();
    await expect(run.fns.procs.dev.route({ url: "ehr/summary" })).rejects.toThrow(/must start with/);
    await expect(run.fns.procs.dev.route({ url: "/ehr/summary?tab=1" })).rejects.toThrow(/query/);
    await expect(run.fns.procs.dev.route({ url: "/ehr/sum mary" })).rejects.toThrow(/not a path segment/);
    await expect(run.fns.procs.dev.route({ url: "/" })).rejects.toThrow(/root route/);

    await run.fns.procs.dev.route({ url: "/ehr/patient/:id/cardio/summary" });
    await expect(run.fns.procs.dev.route({ url: "/ehr/patient/:id/cardio/summary" })).rejects.toThrow(/already/);

    // An address the process itself serves is not free either — the framework's
    // own, in this bare ctx.
    await expect(run.fns.procs.dev.route({ url: "/procs/modules" })).rejects.toThrow(/already answers/);
});
