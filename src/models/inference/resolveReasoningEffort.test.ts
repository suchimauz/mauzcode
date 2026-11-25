import { expect, test } from "bun:test";
import resolve from "./resolveReasoningEffort";
const ctx = {} as Context;
const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
test("Claude effort matrix preserves requested/applied/mode/downgrade/reason contract", async () => {
    for (const model of ["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5", "claude-sonnet-5", "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5", "unknown"]) {
        const adaptive = /(?:opus|sonnet|haiku|fable)-5|(?:opus|sonnet)-4-6/.test(model);
        const always = /(?:opus|sonnet|haiku|fable)-5/.test(model);
        const xhigh = /opus|fable|-5-5/.test(model);
        const supported = adaptive ? [...(always ? [] : ["off"]), "low", "medium", "high", ...(xhigh ? ["xhigh"] : [])] : ["off"];
        const defaultEffort = adaptive && !always ? "medium" : "off";
        for (const effort of [undefined, "auto", ...levels, "invalid"] as const) {
            const requested = !effort || effort === "invalid" ? "auto" : effort;
            const applied = requested === "auto" ? defaultEffort : supported.includes(requested) ? requested : [...levels.slice(0, levels.indexOf(requested))].reverse().find(l => supported.includes(l)) ?? levels.find(l => supported.includes(l))!;
            const downgraded = requested !== "auto" && applied !== requested;
            expect(await resolve(ctx, null, { model, effort: effort as types.models.ReasoningLevel | "auto" })).toEqual({ requested, applied, mode: adaptive ? "anthropic-adaptive" : "none", downgraded, reason: downgraded ? `${requested} is unsupported by ${model}; using ${applied}` : null });
        }
    }
});
test("model case and dated suffixes retain Claude capability matching", async () => {
    expect(await resolve(ctx, null, { model: "CLAUDE-OPUS-5-20260101", effort: "xhigh" })).toMatchObject({ applied: "xhigh", mode: "anthropic-adaptive" });
});
