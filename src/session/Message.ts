/** Persisted transcript message. Large tool outputs retain their immutable result reference across saves and forks; native reasoning blocks ride on the first tool call of a turn with their origin. */
export type Message = {
    role: string;
    content?: string | Array<Record<string, any>> | null;
    idx?: number;
    tool_calls?: Array<{ id: string; name: string; args: any; /** Opaque Gemini signature returned by the provider. */ thoughtSignature?: string; /** Original Gemini parts, including signatures, replayed unchanged for a tool turn. */ geminiParts?: Array<Record<string, any>>; /** Provider reasoning of the turn, stored on the first call only and replayed by opted-in protocols. */ reasoning_content?: string; /** Native signed reasoning blocks of the turn (anthropic), stored on the first call only. */ reasoning_blocks?: types.models.StreamResult["reasoningBlocks"]; /** Connection and model that produced reasoning_blocks; replay requires an exact match. */ reasoning_origin?: { connectionId: string; model: string } }>;
    tool_call_id?: string;
    message_type?: string;
    excluded_from_llm?: boolean;
    excluded_from_cursor?: boolean;
    author?: string | null;
    /** Reference metadata only; contents are loaded lazily through agent.readResult. */
    result_ref?: types.agent.ResultRef | null;
};
