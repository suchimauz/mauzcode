// OpenRouter API key owned by the jev module (relocated from the legacy llm.openrouterApiKey setting).
export default {
    type: "secret" as const,
    env: "OPENROUTER_API_KEY",
    default: null,
    title: "OpenRouter API key (jev)",
    description: "secret:// or env:// reference used by the jev module; falls back to the OPENROUTER_API_KEY environment variable.",
};
