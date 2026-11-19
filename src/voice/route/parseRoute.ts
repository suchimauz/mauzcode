/**
 * Parse a voice route by its exact grammar without any provider or storage access
 *
 * Use to validate route syntax for the default-route setting and stored chat overrides. Splits at the first slash
 * and the first colon after it — `<provider>/<accountName>:<modelId>` — preserving internal account spaces and
 * slash or colon characters inside the native model id. Registration and existence are checked by resolveRoute,
 * not here. Field rules mirror the SDK: the provider id is lowercase kebab-case (`ProviderDefinition.id`), the
 * account name follows voice connection CRUD (1–100 characters, no slash or colon) and the native model id is a
 * non-blank string of at most 200 characters. A malformed route throws a `routeUnavailable` failure with reason
 * `invalid-route` and fixed text: a route string can embed a credential-bearing URL, so it is never echoed back.
 * @param opts.route Exact provider/accountName:modelId route to parse without trimming.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact provider/accountName:modelId route to parse without trimming. */
        route: string;
    },
): types.voice.VoiceRoute {
    const route = opts.route;
    const fail = (): never => {
        throw ctx.fns.voice.route.failure({
            message: "Invalid voice route; use provider/account:modelId.",
            reason: "invalid-route",
        });
    };
    if (typeof route !== "string" || !route) fail();
    const slash = route.indexOf("/");
    if (slash <= 0) fail();
    const provider = route.slice(0, slash);
    // Same shape the provider loader enforces on declarations: an uppercase, spaced or punctuated id is
    // syntactically impossible for a registered provider.
    if (!KEBAB.test(provider)) fail();
    const colon = route.indexOf(":", slash + 1);
    if (colon <= slash + 1 || colon === route.length - 1) fail();
    const accountName = route.slice(slash + 1, colon), modelId = route.slice(colon + 1);
    // CRUD limits: account names are 1–100 characters after trim and never carry a slash; native model ids
    // keep every slash and colon but stay within the 200-character declaration limit.
    if (accountName.includes("/") || accountName !== accountName.trim() || accountName.length > 100) fail();
    if (!modelId.trim() || modelId.length > 200) fail();
    return { provider, accountName, modelId };
}

// Kept in one place per module: identical to the loader's provider id pattern.
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
