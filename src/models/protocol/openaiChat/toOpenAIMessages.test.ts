import { expect, test } from "bun:test";
import convert from "./toOpenAIMessages";
const ctx = {} as Context;
test("text, tool calls and multimodal tool results preserve the transcript", () => {
    const messages = [{ role: "system", content: "sys" }, { role: "assistant", content: " ", tool_calls: [{ id: "t", name: "read", args: { path: "x" } }] }, { role: "tool", tool_call_id: "t", content: [{ type: "text", text: "result" }, { type: "image", mimeType: "image/png", data: "AQ==" }] }];
    const before = structuredClone(messages);
    expect(convert(ctx, null, { messages })).toEqual([{ role: "system", content: "sys" }, { role: "assistant", tool_calls: [{ id: "t", type: "function", function: { name: "read", arguments: '{"path":"x"}' } }] }, { role: "tool", tool_call_id: "t", content: "result" }, { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AQ==" } }] }]);
    expect(messages).toEqual(before);
});
test("PDF fallback retains local path and extracted text; image-only tool result has placeholder", () => {
    expect(convert(ctx, null, { messages: [{ role: "user", content: [{ type: "document", fileName: "x.pdf", path: "/tmp/x.pdf", extractedText: "report" }] }, { role: "tool", tool_call_id: "t", content: [{ type: "image", mimeType: "image/png", data: "AQ==" }] }] })).toEqual([{ role: "user", content: "[Attached PDF: x.pdf\nLocal path: /tmp/x.pdf]\n\nreport" }, { role: "tool", tool_call_id: "t", content: "(image attached below)" }, { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AQ==" } }] }]);
});
test("null, object, mixed invalid blocks and default arguments retain legacy normalization", () => {
    expect(convert(ctx, null, { messages: [{ role: "user", content: null }, { role: "user", content: { x: 1 } }, { role: "assistant", tool_calls: [{ id: "t", name: "f" }] }, { role: "user", content: [{ type: "invalid" }, { type: "text", text: "valid" }] }] })).toEqual([{ role: "user", content: "" }, { role: "user", content: '{"x":1}' }, { role: "assistant", tool_calls: [{ id: "t", type: "function", function: { name: "f", arguments: "{}" } }] }, { role: "user", content: "valid" }]);
});
