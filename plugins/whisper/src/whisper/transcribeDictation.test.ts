import { expect, test } from "bun:test";

const transcribe = (await import("./transcribeDictation")).default;
test("bounded transcription rejects empty and oversized input before touching files", async () => {
    for (const audio of [new Uint8Array(), new Uint8Array(8388609)]) {
        await expect(transcribe({} as any, null, { audio })).rejects.toThrow("invalid_audio");
    }
});
