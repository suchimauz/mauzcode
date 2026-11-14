// OpenAI API key owned by the embeddings module (relocated from the legacy llm.openaiApiKey setting).
export default {
    type: "secret" as const,
    env: "OPENAI_API_KEY",
    default: null,
    title: "OpenAI API key (embeddings)",
    description: "secret:// or env:// reference used by the embeddings module; falls back to the OPENAI_API_KEY environment variable.",
};
