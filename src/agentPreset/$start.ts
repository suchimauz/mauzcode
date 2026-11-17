/** Built-ins require no startup seeding; historical rows are handled only by migrations. */
export default async function (_ctx: Context, _session: Session | null, _opts: {}): Promise<void> {
}
