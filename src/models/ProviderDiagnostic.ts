/** Bounded provider evidence suitable for operator-visible failure history. */
export type ProviderDiagnostic = {
    provider: string;
    stage: "http" | "stream" | "transport";
    status?: number;
    code?: string;
    reason?: string;
    message?: string;
    summary: string;
};
