// Usage threshold in percent: a quota window at or above this value is classified as critical.
export default {
    type: "number" as const,
    default: 60,
    min: 0,
    max: 100,
    env: "LLM_USAGE_CRITICAL_PERCENT",
    title: "Usage critical threshold, %",
    description: "Percentage of a model connection quota window at or above which the usage view marks it critical (orange).",
};
