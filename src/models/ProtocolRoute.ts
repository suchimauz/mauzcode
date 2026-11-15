/** Shared-protocol endpoint chosen by a protocol-route provider for one model request. */
export type ProtocolRoute = {
    /** Shared protocol id from the closed core registry. */
    protocol: "openai-chat" | "openai-responses" | "anthropic" | "gemini";
    /** Base URL; validated and versioned by the protocol's baseUrl. */
    baseUrl: string;
    /** Provider headers (authentication, session identity); merged after Accept and protocol defaults. */
    headers: Record<string, string>;
    /** Optional extra JSON body fields for the shared protocol request. Merged after the protocol's own fields and never allowed to override them; protocol-owned keys are rejected before any request. */
    body?: Record<string, unknown>;
    /** Ask the shared protocol to replay stored assistant reasoning on tool-call turns; honored only by protocols that can carry it. @default false */
    replayReasoning?: boolean;
};
