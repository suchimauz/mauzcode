/**
 * Map model routes to their model connection account names for picker group labels
 *
 * Use when projecting model choices that arrive as provider/accountName:modelId routes. Each route whose provider and account match a stored model connection (models.list) is labelled with that connection's account name; routes without a matching connection get no label. Never changes routes or reads secrets.
 * @param opts.models Model routes in provider/accountName:modelId form to label.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model routes in provider/accountName:modelId form to label. */
        models: string[];
    },
): Promise<Record<string, string>> {
    const accounts = new Map((await ctx.fns.models.list({})).map(connection => [connection.provider + "/" + connection.accountName, connection.accountName] as const));
    const labels: Record<string, string> = {};
    for (const model of opts.models) {
        const colon = model.indexOf(":", Math.max(0, model.indexOf("/")));
        const account = colon > 0 ? accounts.get(model.slice(0, colon)) : undefined;
        if (account) labels[model] = account;
    }
    return labels;
}
