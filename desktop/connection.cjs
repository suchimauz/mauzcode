'use strict';
const { sameOrigin } = require('./security.cjs');
const attachNavigation = require('./navigation.cjs');
const mismatch = 'По этому адресу не удалось подтвердить сервер MauzCode.';
const oidc = 'Вход через внешний провайдер (OIDC) не поддерживается в пилоте. Вернитесь к прежнему серверу или укажите другой адрес.';
const isLogin = href => /^\/auth\/(login|setup|google|oidc)(\/|$)/.test(new URL(href).pathname);
function loginURL(origin, url) {
  const login = new URL('/auth/login', origin); login.searchParams.set('next', new URL(url).pathname); return login.href;
}

// Probe from *this partition*, not Node fetch or the default Electron session. No redirects,
// credentials in the URL, certificate exceptions or unbounded bodies from an unconfirmed host.
async function probeSession(profile, origin, signal) {
  const endpoint = origin + '/auth/session';
  const response = await profile.fetch(endpoint, { headers: { Accept: 'application/json' }, credentials: 'include', cache: 'no-store', redirect: 'error', bypassCustomProtocolHandlers: true, signal });
  // Electron documents Response.url/type as unreliable for session.fetch. Use the
  // exact request URL with redirect:'error', then verify HTTP status and JSON instead.
  if (response.redirected) { await response.body?.cancel(); throw Error(mismatch); }
  const code = response.status;
  if (code !== 200 && code !== 401) { await response.body?.cancel(); throw Error(`Проверка MauzCode: HTTP ${code}.`); }
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); throw Error(mismatch); }
  const reader = response.body?.getReader(); if (!reader) throw Error(mismatch);
  const parts = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break;
      if ((size += value.byteLength) > 65536) { await reader.cancel(); throw Error(mismatch); } parts.push(Buffer.from(value)); }
  } finally { reader.releaseLock(); }
  let data; try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw Error(mismatch); }
  if (code === 200 && (data?.authenticated === true || (data?.authenticated === false && data?.required === false))) return 'ok';
  // The pre-auth middleware on older MauzCode versions intercepts this GET. Its 401
  // can open the login form, but never confirms a server or changes the saved address.
  if (code === 401 && (data?.authenticated === false || (data?.error === 'unauthorized' && data?.message === 'Authentication required'))) return 'login';
  throw Error(mismatch);
}
function reasonFor(error) {
  const detail = String(error?.code || '') + ' ' + String(error?.cause?.code || '') + ' ' + String(error?.message || error);
  if (/CERT|TLS|SSL|certificate/i.test(detail)) return 'Ошибка сертификата TLS. Проверьте сертификат сервера: продолжить с недействительным сертификатом нельзя.';
  if (/timeout|timed out/i.test(detail)) return 'Сервер не ответил вовремя.';
  if (detail.includes(mismatch) || /^Проверка MauzCode: HTTP \d+\.$/.test(error?.message)) return error.message;
  return 'Не удалось проверить подключение. Проверьте адрес и сеть; перенаправление проверки на другой адрес не разрешено.';
}

/** One candidate. The old window and disk profile belong to the caller until synchronous promote(). */
function stageConnection({ url, profile, window, promote, failed, signingIn, onStart, onDocument, pageError, openExternal,
  verifyDocument = () => window.webContents.executeJavaScriptInIsolatedWorld(1001, [{ code: "document.contentType === 'text/html' || document.contentType === 'application/xhtml+xml'" }]),
  timeoutMs = 30000, loginTimeoutMs = 300000, loginPollMs = 1500 }) {
  const origin = new URL(url).origin, contents = window.webContents, abort = new AbortController();
  let mode = 'candidate', sequence = 0, login = false, checkedLogin = false, loaded = false, navigatingBack = false;
  let timer, poll, attempt = 0;
  function clear() { clearTimeout(timer); clearTimeout(poll); }
  function deadline(ms) { clearTimeout(timer); timer = setTimeout(() => reject('Время ожидания истекло. Проверьте адрес и попробуйте снова.'), ms); }
  function reject(message, quiet = false) {
    if (mode !== 'candidate') return;
    mode = 'retired'; clear(); abort.abort(); failed(message, quiet);
  }
  function load(href) {
    // did-fail-load carries frame and TLS diagnostics; replaced loads reject with ERR_ABORTED.
    void window.loadURL(href).catch(e => { if (mode === 'candidate' && e.code !== 'ERR_ABORTED' && e.errno !== -3) reject(reasonFor(e)); });
  }
  function showLogin() {
    if (!login) { login = true; deadline(loginTimeoutMs); signingIn(); }
  }
  async function checkDocument(statusCode) {
    if (mode !== 'candidate' || !loaded) return;
    clearTimeout(poll);
    const seq = sequence, check = ++attempt, href = contents.getURL();
    const current = () => mode === 'candidate' && loaded && sequence === seq && check === attempt && !window.isDestroyed() && contents.getURL() === href;
    try {
      const result = await probeSession(profile, origin, abort.signal);
      if (!current()) return;
      if (result === 'login') {
        showLogin();
        if (!isLogin(href) && !checkedLogin) { checkedLogin = true; load(loginURL(origin, url)); }
        else poll = setTimeout(() => void checkDocument(statusCode), loginPollMs);
        return;
      }
      if (isLogin(href)) {
        if (navigatingBack || isLogin(url)) { reject('Войдите и укажите адрес чата, а не страницу входа.'); return; }
        navigatingBack = true; load(url); return;
      }
      if (statusCode === 401) { reject('Доступ к странице не разрешён (HTTP 401).'); return; }
      const html = await verifyDocument(); if (!current()) return;
      if (!html || new URL(href).pathname === '/auth/session') { reject(mismatch); return; }
      // No await from the final document check through the atomic save and promotion.
      promote(); mode = 'active'; clear(); abort.abort();
    } catch (e) { if (current()) reject(reasonFor(e)); }
  }
  attachNavigation({ contents, origin,
    start() { ++sequence; loaded = false; clearTimeout(poll); },
    changing() { if (mode === 'active') onStart(); },
    ready(href, status) {
      if (mode === 'active') { loaded = true; onDocument(href, status); return; }
      if (mode !== 'candidate') return;
      if (status === 401 && !login) showLogin();
      loaded = true; void checkDocument(status);
    },
    failure(message, http) {
      if (mode === 'candidate') reject(message);
      else if (mode === 'active') pageError(message, http);
    },
    external(target, source) {
      if (mode === 'candidate') {
        const fromLogin = login || [source, contents.getURL()].some(s => sameOrigin(s, origin) && isLogin(s));
        reject(fromLogin ? oidc : 'Страница перенаправляет на другой сервер. Адрес не изменён.');
      } else if (mode === 'active') openExternal(target);
    }
  });
  return {
    async start() {
      deadline(timeoutMs);
      try {
        const result = await probeSession(profile, origin, abort.signal);
        if (mode !== 'candidate') return;
        if (result === 'login') { showLogin(); checkedLogin = true; load(loginURL(origin, url)); } else load(url);
      } catch (e) { if (mode === 'candidate') reject(reasonFor(e)); }
    },
    cancel(quiet = false) { reject('Проверка отменена. Сохранённый адрес не изменён.', quiet); },
    retire() { mode = 'retired'; clear(); abort.abort(); }
  };
}
module.exports = { stageConnection, probeSession, reasonFor };
