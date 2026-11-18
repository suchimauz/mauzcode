// A declared tool: what a `mod/$tool_<name>.md` (or `.json`) file says.
//
// Declaration and implementation are SEPARATE on purpose:
//
//   mod/$tool_read.md   the declaration — schema, docs, prompt contributions.
//                       Data, not code: it is the JSON Schema that ships to the
//                       provider verbatim, and it is diffable as prose.
//   mod/read.ts         the implementation — an ordinary procs function, so it
//                       is callable by hand (`ctx.fns.tools.read({ path })`),
//                       from §eval, and from other modules, not only by a model.
//
// The `.md` form carries the declaration as YAML frontmatter and the wire-format
// documentation as the markdown body; `.json` is the same fields with no prose.
// The implementation defaults to `<module>.<name>` and is overridable with `fn`.
//
//   ---
//   description: Read a file
//   marker: read
//   parameters:
//     type: object
//     properties:
//       path: { type: string, description: File path }
//     required: [path]
//     additionalProperties: false
//   ---
//   ### `§read`
//   Body is a path, or `key: value` lines…
//
// A capability described ONCE is reachable by both protocols: the markers loop
// parses §read into arguments and lands on it, and the native JSON tool-call
// loop hands `parameters` straight to the provider as a function schema.
export type Tool = {
    /** One line, shown to the model as the function description. */
    description: string;

    /** JSON Schema for the arguments object. Keep `additionalProperties: false`
     *  — it is what makes OpenAI's `strict` mode legal and what lets
     *  ctx.fns.tools.validate reject typo'd option names before anything runs. */
    parameters: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
        additionalProperties?: false;
    };

    /** The function that implements it, dotted (`files.read`). Defaults to
     *  `<module>.<name>` — the fn sitting next to the declaration. */
    fn?: string;

    /** Exact runtime functions this tool wraps (`agent.readResult`). The tool is
     *  advertised and executed only when the agent's preset allows `fn` AND every
     *  entry; a malformed list denies the tool. Use for native adapters, so the
     *  preset check covers the capability, not just the adapter. */
    requires?: string[];

    /** A synchronous predicate (dotted name) called with `{ agent }`; the tool is
     *  advertised and executable only while it returns true — for tools that only
     *  make sense in one situation, such as `finish_task` for delegated children.
     *  A missing or throwing predicate makes the tool unavailable. */
    availableWhen?: string;

    /** A function (dotted name) run after the schema passes, for rules a schema
     *  cannot state — "exactly one of these two shapes", "this string may not be
     *  empty". It is handed `{ args }` and returns the complaints; anything
     *  non-empty stops the call. */
    validate?: string;

    /** The markers-protocol kind this tool backs (`§read` → "read"), when it
     *  has one. Marker-only rendering kinds (html) have no tool; a tool with no
     *  marker is reachable only in JSON protocol mode. */
    marker?: string;

    /** One line for the "Available tools" index in the system prompt. A tool
     *  with no snippet is still callable but is not advertised — that is the
     *  opt-out for something only other code should reach. */
    promptSnippet?: string;

    /** Bullets merged (deduped) into the prompt's Discipline section when this
     *  tool is active. Use for cross-tool habits ("read hashline before edit"). */
    promptGuidelines?: string[];

    /** The tool's own wire-format block for markers mode — the markdown body of
     *  the `.md` declaration. It lives with the tool rather than in the prompt
     *  file so a tool that is not loaded costs zero prompt tokens, and a tool
     *  that changes its body format cannot forget to say so. */
    doc?: string;

    /** How calls of this tool appear in chat: label, allow-listed icon,
     *  category and a summary template or `@formatter`. Validated by the loader
     *  per field; see types.tools.ToolPresentation. */
    presentation?: types.tools.ToolPresentation;
};
