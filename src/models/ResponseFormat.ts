/** Structured output request for models.call and StreamRequest.responseFormat: any JSON object, or JSON matching a JSON Schema. */
export type ResponseFormat =
    | { type: "json_object" }
    | {
        type: "json_schema";
        /** Schema name sent to providers that require one. */
        name: string;
        /** JSON Schema of the expected value; models.call checks top-level type, required and additionalProperties:false. */
        schema: Record<string, unknown>;
        /** Ask the provider for strict schema adherence where supported. @default true */
        strict?: boolean;
    };
