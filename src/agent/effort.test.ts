import { describe, expect, test } from "bun:test";
import { mkModelsTestCtx as mkTestCtx } from "./modelsTestCtx.entry";
import claudeListModels from '../models/provider/claude/claudeListModels';

describe("agent reasoning effort", () => {
    test("persists preference and reports model-safe applied effort", async () => {
        const ctx:any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock/default:test" });
        const result = await ctx.fns.agent.setReasoningEffort({ id: agent.id, effort: "high" });
        expect(result).toMatchObject({ requested: "high", applied: "high", downgraded: false });
        expect((await ctx.fns.session.load({ id: agent.id })).reasoningEffort).toBe("high");
    });

    test("HTTP route changes only the selected agent", async () => {
        const ctx:any = await mkTestCtx();
        const one = await ctx.fns.agent.start({ model: "mock/default:test" });
        const two = await ctx.fns.agent.start({ model: "mock/default:test" });
        const response = await ctx.fns.procs.http.dispatch({ url: `/agent/${one.id}/effort`, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "effort=high" });
        expect(response.status).toBe(204);
        expect((await ctx.fns.session.load({ id: one.id })).reasoningEffort).toBe("high");
        expect((await ctx.fns.session.load({ id: two.id })).reasoningEffort).toBe("auto");
    });

    test("Claude 5 offers low…max without off; auto keeps the model's own thinking", async () => {
        const ctx:any = await mkTestCtx();
        const catalogue = await claudeListModels(ctx, null, {});
        const opus = catalogue.find((m:any)=>m.id === "claude-opus-5-5");
        expect(opus!.reasoning!.supported).toEqual(["low", "medium", "high", "xhigh"]);
        for (const id of ["claude-fable-5-2", "claude-sonnet-5-5", "claude-haiku-5-5"]) expect(catalogue.find((m:any)=>m.id === id)!.reasoning!.supported).toEqual(["low", "medium", "high", "xhigh"]);
    });
});
