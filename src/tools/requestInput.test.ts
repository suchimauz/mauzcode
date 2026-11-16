// FUNCTIONAL test: native request_input on a real test database.
import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

const snapshot = (allow: string[], deny: string[] = []): types.agentPreset.Snapshot =>
    ({ presetId: "test", name: "TestPreset", layers: [{ id: "test", allow, deny, plugins: [], prompt: "", excludeSections: [] }] });

async function setup(preset?: types.agentPreset.Snapshot) {
    const ctx: any = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString("base64") } });
    const agent = await ctx.fns.agent.start({ model: "test:model", systemPrompt: "" });
    // Explicit rules: the adapters are not in the Standard catalogue until task 5.1.
    agent.preset = preset ?? snapshot(["*"]);
    await ctx.fns.session.save({ agent });
    const call = (args: unknown) => ctx.fns.tools.call({ name: "request_input", args, agent });
    const inputs = async () => ctx.fns.procs.db.select({ sql: "SELECT * FROM inputs WHERE agent_id = ? ORDER BY created_at", params: [agent.id] });
    return { ctx, agent, call, inputs };
}

describe("request_input", () => {
    test("creates an input owned by the invoking agent and returns at once without an answer", async () => {
        const { call, inputs, agent } = await setup();
        const result = await call({ kind: "choice", title: "Which?", spec: { options: ["a", "b"] }, waitForAnswer: true });
        expect(result.isError).toBe(false);
        const out = JSON.parse(result.output);
        expect(out).toEqual({ id: expect.stringMatching(/^in/), kind: "choice", state: "open", waiting: true });
        const rows = await inputs();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: out.id, agent_id: agent.id, state: "open" });
        expect(rows[0].spec._agentWait).toBe(true);
    });

    test("invalid spec and unavailable kinds create nothing; unavailable kinds fail identically", async () => {
        const { call, inputs } = await setup(snapshot(["tools.*", "input.request"]));
        const invalid = await call({ kind: "choice", title: "Which?", spec: { options: [] } });
        expect(invalid.isError).toBe(true);
        const missing = await call({ kind: "nope", title: "x" });
        // secret requires tools.bash and secrets.get, which this preset denies.
        const hidden = await call({ kind: "secret", title: "x", spec: { saveAs: "secret://test/x" } });
        expect(missing.output).toBe('Error: request_input: kind "nope" is not available');
        expect(hidden.output).toBe('Error: request_input: kind "secret" is not available');
        for (const text of [missing.output, hidden.output]) expect(text).not.toMatch(/choice|confirm|grid|batch/);
        expect(await inputs()).toHaveLength(0);
    });

    test("rejects agent targeting and missing trusted context", async () => {
        const { ctx, call, inputs } = await setup();
        for (const extra of [{ agentId: "someone-else" }, { session: "x" }, { owner: "x" }]) {
            const result = await call({ kind: "confirm", title: "Send?", ...extra });
            expect(result.isError).toBe(true);
            expect(result.output).toMatch(/invalid arguments|unknown argument/);
        }
        await expect(ctx.fns.tools.requestInput({ kind: "confirm", title: "Send?" })).rejects.toThrow("trusted agent invocation");
        expect(await inputs()).toHaveLength(0);
    });

    test("secret form returns only a reference; the value never reaches the transcript", async () => {
        const { ctx, call, agent } = await setup();
        const out = JSON.parse((await call({ kind: "secret", title: "Token", spec: { saveAs: "secret://test/native-token" } })).output);
        expect(await ctx.fns.input.submit({ id: out.id, values: { value: "n4tive-s3cret" } })).toEqual({ state: "submitted" });
        const transcript = JSON.stringify([await ctx.fns.session.getMessages({ id: agent.id }), await ctx.fns.session.getEvents({ id: agent.id })]);
        expect(transcript).not.toContain("n4tive-s3cret");
        expect(transcript).toContain("secret://test/native-token");
    });

    test("cannot open protected approval kinds; generic confirm is not a plan approval", async () => {
        const { ctx, call, agent, inputs } = await setup();
        const review = await call({ kind: "planning-review", title: "Approve plan", spec: {} });
        expect(review.isError).toBe(true);
        const confirm = JSON.parse((await call({ kind: "confirm", title: "Approve the plan?", spec: { details: "plan" } })).output);
        await ctx.fns.input.submit({ id: confirm.id, values: { decision: "yes" } });
        const planning = await ctx.fns.planning.read({ agentId: agent.id });
        expect(planning.mode).not.toBe("execute-approved");
        expect(planning.pending ?? null).toBeNull();
        expect((await inputs()).filter((row: any) => row.kind === "planning-review")).toHaveLength(0);
    });

    test("is absent when input.request is denied and switches prompt guidance", async () => {
        const { ctx } = await setup();
        const allowed = { id: "p", preset: snapshot(["tools.*", "input.request"]) } as any;
        const denied = { id: "p", preset: snapshot(["tools.*", "input.kinds"]) } as any;
        expect(ctx.fns.agent.wireTools({ agent: allowed }).map((t: any) => t.name)).toContain("request_input");
        expect(ctx.fns.agent.wireTools({ agent: denied }).map((t: any) => t.name)).not.toContain("request_input");
        expect(ctx.fns.input.promptSection({ native: true })).toContain("call the request_input tool");
        expect(ctx.fns.input.promptSection({})).toContain("await ctx.fns.input.request(");
        const prompt = await ctx.fns.agent.fullSystemPrompt({ agent: { ...allowed, workspaceDir: "/tmp" } });
        expect(prompt).toContain("call the request_input tool");
    });
});
