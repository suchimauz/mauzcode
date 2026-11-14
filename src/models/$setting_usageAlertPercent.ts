// Usage threshold in percent: a quota window at or above this value is classified as alert.
export default {
    type: "number" as const,
    default: 75,
    min: 0,
    max: 100,
    env: "LLM_USAGE_ALERT_PERCENT",
    title: "Usage alert threshold, %",
    description: "Percentage of a model connection quota window at or above which the usage view marks it alert (red).",
};
