import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
const attachNavigation = require('./navigation.cjs');
const origin = 'https://mauzcode.test';
function fixture() {
  let url = origin, handler: Function = () => {};
  const contents = Object.assign(new EventEmitter(), { getURL: () => url, setWindowOpenHandler: (h: Function) => { handler = h; } });
  const failures: string[] = [], pages: any[] = [], external: string[] = []; let starts = 0;
  attachNavigation({ contents, origin, start: () => starts++, ready: (...v: any[]) => pages.push(v), failure: (v: string) => failures.push(v), external: (v: string) => external.push(v) });
  function navigate(code: number, href = origin + '/') {
    contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false }); url = href;
    contents.emit('did-navigate', {}, url, code); contents.emit('did-finish-load');
  }
  function failure(code: number, main = true) { contents.emit('did-fail-load', {}, code, 'err', url, main); }
  return { contents, navigate, failure, failures, pages, external, get starts() { return starts; }, popup: (url: string) => handler({ url }) };
}
describe('Electron main-frame navigation policy', () => {
  for (const code of [403, 404, 500]) test(`HTTP ${code} preserves original error response; never a loaded app`, () => {
    const f = fixture(); f.navigate(code); f.failure(-379); expect(f.failures).toEqual([`HTTP ${code}.`]); expect(f.pages).toEqual([]);
    f.navigate(200); expect(f.pages).toHaveLength(1);
  });
  test('401 is a sign-in response, not a network error; final authorization belongs to the session check', () => {
    const f = fixture(); f.navigate(401, origin + '/auth/login'); f.failure(-379); expect(f.pages).toEqual([[origin + '/auth/login', 401]]); expect(f.failures).toEqual([]);
  });
  test('separates TLS, network and renderer failures; abort/iframes do not disconnect', () => {
    const f = fixture(); f.failure(-3); f.failure(-105, false); expect(f.failures).toBeEmpty();
    f.failure(-202); f.failure(-105); f.contents.emit('render-process-gone', {}, {reason:'crashed'});
    expect(f.failures[0]).toContain('TLS'); expect(f.failures[1]).toContain('-105'); expect(f.failures[2]).toContain('интерфейса');
    f.contents.emit('did-finish-load'); expect(f.pages).toBeEmpty();
  });
  test('only committed main documents count; in-page and subframe events do not replace them', () => {
    const f = fixture(); f.contents.emit('did-finish-load'); expect(f.pages).toBeEmpty(); f.navigate(200);
    f.contents.emit('did-start-navigation', {isMainFrame:true,isSameDocument:true}); f.contents.emit('did-start-navigation', {isMainFrame:false}); expect(f.starts).toBe(1);
    f.navigate(204); f.navigate(200,'https://foreign.example/'); expect(f.pages).toHaveLength(1);
  });
  test('guards redirects, popups and webviews', () => {
    const f = fixture(); let blocked = 0; const foreign = 'https://external.example/'; const event = {url:foreign,preventDefault() { blocked++; }};
    f.contents.emit('will-navigate', {...event,url:origin+'/ok'}); f.contents.emit('will-redirect',{...event,isMainFrame:false}); expect(blocked).toBe(0);
    f.contents.emit('will-navigate', event); f.contents.emit('will-redirect',{...event,isMainFrame:true}); f.contents.emit('will-attach-webview',event);
    expect(f.popup(foreign)).toEqual({action:'deny'}); expect(f.external).toEqual([foreign,foreign,foreign]); expect(blocked).toBe(3);
  });
});
