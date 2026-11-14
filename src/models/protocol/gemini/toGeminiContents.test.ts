import { expect, test } from "bun:test";
import convert from "./toGeminiContents";
const ctx = {} as Context;
test("signed native tool parts, ids and images survive replay without mutation", async () => {
    const saved = [{ text: "plan", thought: true }, { functionCall: { id: "native", name: "read", args: { path: "x" } }, thoughtSignature: "opaque" }];
    const messages = [{ role: "assistant", tool_calls: [{ id: "canonical", name: "read", args: { path: "x" }, geminiParts: saved }] }, { role: "tool", tool_call_id: "canonical", content: [{ type: "text", text: "result" }, { type: "image", mimeType: "image/png", data: "AQ==" }] }];
    const before = structuredClone(messages);
    const output = await convert(ctx, null, { messages });
    expect(output).toEqual([{ role: "model", parts: saved }, { role: "user", parts: [{ functionResponse: { name: "read", id: "native", response: { output: "result" } } }, { inlineData: { mimeType: "image/png", data: "AQ==" } }] }]);
    output[0]!.parts[0]!.text = "changed";
    expect(messages).toEqual(before);
});
test("canonical function signatures and adjacent roles are preserved", async () => {
    expect(await convert(ctx, null, { messages: [{ role: "user", content: "a" }, { role: "user", content: "b" }, { role: "assistant", tool_calls: [{ id: "t", name: "f", thoughtSignature: "sig" }] }, { role: "tool", tool_call_id: "t", content: "done" }] })).toEqual([{ role: "user", parts: [{ text: "a" }, { text: "b" }] }, { role: "model", parts: [{ functionCall: { name: "f", args: {} }, thoughtSignature: "sig" }] }, { role: "user", parts: [{ functionResponse: { name: "f", response: { output: "done" } } }] }]);
});
test("invalid content and foreign or mismatched signatures fail closed", async () => {
    const invalid = [[{ role: "system", content: "x" }], [{ role: "tool", tool_call_id: "missing", content: "x" }], [{ role: "other", content: "x" }], [{ role: "user", content: [{ type: "video" }] }], [{ role: "assistant", tool_calls: [{ id: "t", name: "f", thought_signature: "foreign" }] }], [{ role: "assistant", tool_calls: [{ id: "t", name: "f", reasoning_content: "foreign" }] }], [{ role: "assistant", tool_calls: [{ id: "t", name: "f", thoughtSignature: 1 }] }], [{ role: "assistant", tool_calls: [{ id: "t", name: "f", geminiParts: [{ functionCall: { name: "different" } }] }] }]];
    for (const messages of invalid) await expect(convert(ctx, null, { messages })).rejects.toThrow();
});
