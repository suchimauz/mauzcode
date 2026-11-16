import { test, expect } from 'bun:test';
import identity from './identity';
const check = (access: string, accountId = 'fixture') => identity({} as Context, null, { t: { access, accountId } });
const token = (id: string) => `header.${Buffer.from(JSON.stringify({'https://api.openai.com/auth': {chatgpt_account_id: id}})).toString('base64url')}.signature`;
test('identity payload must be present and parseable', () => {
    for (const value of ['', 'header', 'header..signature', 'header.invalid.signature']) expect(() => check(value)).toThrow('Invalid access identity');
});
test('identity account claim must match the selected account', () => {
    expect(() => check(token('fixture'))).not.toThrow();
    expect(() => check(token('other'))).toThrow('Account identity mismatch');
    expect(() => check(token('fixture'), '')).toThrow('Account identity mismatch');
});
