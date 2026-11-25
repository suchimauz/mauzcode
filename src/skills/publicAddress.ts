type PublicAddressResult = { ok: true; address: string } | { ok: false; reason: string };
/**
 * Resolve a hostname and accept it only when every address is a public unicast address.
 *
 * Rejects loopback, private, link-local, carrier-grade NAT, multicast, documentation, unique-local and unspecified ranges, IP literals in those ranges and names resolving to any of them. Returns one verified address to pin the connection to, so a later DNS answer cannot redirect it.
 * @param opts.host Hostname or IP literal from an HTTPS URL.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Hostname or IP literal from an HTTPS URL. */
        host: string;
    },
): Promise<PublicAddressResult> {
    const { lookup } = await import('node:dns/promises');
    const { isIP } = await import('node:net');
    const host = opts.host.replace(/^\[|\]$/g, '').toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return { ok: false, reason: 'the host is not public' };
    const v4 = (a: string): boolean => {
        const [x, y] = a.split('.').map(Number) as [number, number];
        return !(x === 0 || x === 10 || x === 127 || (x === 100 && y >= 64 && y <= 127) || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31)
            || (x === 192 && y === 168) || (x === 192 && y === 0) || (x === 198 && (y === 18 || y === 19 || y === 51)) || (x === 203 && y === 0)
            || x >= 224);
    };
    const v6 = (a: string): boolean => {
        const s = a.toLowerCase();
        if (s === '::' || s === '::1') return false;
        const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
        if (mapped) return v4(mapped[1]!);
        return !/^(fc|fd|fe8|fe9|fea|feb|ff|2001:db8|64:ff9b)/.test(s);
    };
    const publicIp = (a: string): boolean => (isIP(a) === 4 ? v4(a) : isIP(a) === 6 ? v6(a) : false);
    let addresses: string[];
    if (isIP(host)) addresses = [host];
    else {
        try { addresses = (await lookup(host, { all: true, verbatim: true })).map(entry => entry.address); }
        catch { return { ok: false, reason: 'the host cannot be resolved' }; }
    }
    if (!addresses.length || !addresses.every(publicIp)) return { ok: false, reason: 'the host resolves to a non-public address' };
    return { ok: true, address: addresses[0]! };
}
