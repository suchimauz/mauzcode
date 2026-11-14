// Usage threshold in percent: a quota window at or above this value is classified as warning.
export default {
    type: "number" as const,
    default: 30,
    min: 0,
    max: 100,
    env: "LLM_USAGE_WARN_PERCENT",
    title: "Usage warning threshold, %",
    description: "Percentage of a model connection quota window at or above which the usage view marks it warning (yellow).",
};
