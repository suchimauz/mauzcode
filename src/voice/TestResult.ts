/** Safe connection-check result; produced without sending any user audio. */
export type TestResult = {
    status: "available" | "unavailable" | "configured" | "disabled";
    /**
     * Machine-readable reason from a closed, local set: a provider reason the SDK knows, or the fixed default of
     * the status. Never provider-supplied text and never a secret value.
     */
    reason: string;
    /** One fixed sentence per status; never provider text and never a secret value. */
    message: string;
    /** Unix epoch milliseconds when the check completed. */
    checkedAt: number;
};
