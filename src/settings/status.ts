/**
 * Reports which provider API keys are present in the environment.
 *
 * Use for the owner settings page. A pure, network-free read of `ctx.env` key presence only: it never reads values
 * into the result, never queries legacy OAuth or CLI login state and calls no `llm` procedure. Connection state comes
 * from model connections.
 */
export default async function (ctx: Context, _session: Session | null, _opts?: {}): Promise<{
    openai: { set: boolean };
    anthropic: { set: boolean };
    kimi: { set: boolean };
    groq: { set: boolean };
    openrouter: { set: boolean };
}> {
    const env = ctx.env;
    return {
        openai: { set: !!env.OPENAI_API_KEY },
        anthropic: { set: !!env.ANTHROPIC_API_KEY },
        kimi: { set: !!env.KIMI_API_KEY },
        groq: { set: !!env.GROQ_API_KEY },
        openrouter: { set: !!env.OPENROUTER_API_KEY },
    };
}
