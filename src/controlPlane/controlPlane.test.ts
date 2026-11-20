import { expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

test("not connected: everything is a quiet no-op", async () => {
    const ctx = await mkTestCtx();
    expect(await ctx.fns.controlPlane.token({})).toBeNull();
    expect(await ctx.fns.controlPlane.heartbeat({})).toBeNull();
    expect(await ctx.fns.controlPlane.services({})).toEqual([]);
});
