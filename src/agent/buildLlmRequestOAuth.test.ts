import { describe, expect, test } from "bun:test";
import claude from '../models/$modelProvider_claude';

import buildRaw from "./buildLlmRequest";
import requireModel from "./requireModel";
import { makeCtx } from "../$main";

// Drop the request-only planning guidance tail (no planning_context row in these fixtures).
const build = async (...a: Parameters<typeof buildRaw>) => { const r = await buildRaw(...a); return { ...r, messages: r.messages.filter((m: any) => m.content !== "planning") }; };

function ctx(systemPreamble?: string): any {
    return { fns: {
        agent: {
            requireModel: (opts: Parameters<typeof requireModel>[2]) => requireModel(makeCtx(), null, opts),
            fullSystemPrompt: async () => "runtime instructions",
            normalizeSleepContext: () => null,
            getSleepGeneration: () => null,
            selectJevContext: async ({ messages }: any) => messages,
        },
        compaction: { project: async ({ messages }: any) => ({ messages, mode: 'full', fallback: null, revision: null }) },
        session: {
            repairToolPairs: ({ messages }: any) => ({ messages, repaired: [] }),
            getMessages: async () => [], getFullMessages: async () => [],
        },
        auth: { attributeMessages: async ({ messages }: any) => ({ applied: false, messages }) },
        models: { resolveRoute: async () => ({ systemPreamble }) },
        attachments: { resolveContent: async ({ messages }: any) => messages },
        procs: { log: { warn: () => {} } },
        planning: { prompt: async () => "planning" },
    } };
}

describe("buildLlmRequest provider descriptor identity", () => {
    test("managed OAuth keeps exact Claude identity in system", async () => {
        const result = await build(ctx(claude.inference.systemPreamble), null, { agent: { id: "a1", model: "claude/work:claude-x", messages: [], scratchpad: {} } as any });
        expect(result.instructions).toBe("You are Claude Code, Anthropic's official CLI for Claude.");
        expect(result.messages[0].content).toBe("runtime instructions");
    });

    test("custom without descriptor keeps system-as-messages policy", async () => {
        const result = await build(ctx(), null, { agent: { id: "a1", model: "custom/work:claude-x", messages: [], scratchpad: {} } as any });
        expect(result.instructions).toBe("");
        expect(result.messages[0].content).toBe("runtime instructions");
    });
});

describe("buildLlmRequest trailing turn", () => {
    const assistantTail = [
        { role: "user", content: "hi" },
        { role: "assistant", content: "final answer" },
    ];

    test("never ends on a bare assistant message (no prefill)", async () => {
        const result = await build(ctx(claude.inference.systemPreamble), null, { agent: { id: "a1", model: "claude/work:claude-opus-5", messages: assistantTail, scratchpad: {} } as any });
        expect(result.messages[result.messages.length - 1].role).toBe("user");
        expect(result.messages[result.messages.length - 2].content).toBe("final answer");
    });

    test("an assistant message carrying tool calls is left alone", async () => {
        const messages = [{ role: "user", content: "hi" }, { role: "assistant", content: "", tool_calls: [{ id: "t1", name: "bash" }] }];
        const result = await build(ctx(claude.inference.systemPreamble), null, { agent: { id: "a1", model: "claude/work:claude-opus-5", messages, scratchpad: {} } as any });
        expect(result.messages[result.messages.length - 1].role).toBe("assistant");
    });

    test("a transcript already ending on user is untouched", async () => {
        const result = await build(ctx(), null, { agent: { id: "a1", model: "custom/work:claude-x", messages: [{ role: "user", content: "hi" }], scratchpad: {} } as any });
        expect(result.messages.length).toBe(3);
    });
});

