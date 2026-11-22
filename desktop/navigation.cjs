'use strict';
const { sameOrigin } = require('./security.cjs');

// Electron 44's navigation details identify main-frame document replacements.
module.exports = function attachNavigation({ contents, origin, start, changing = () => {}, ready, failure, external }) {
  let committed = false, code = 0, httpError = false;
  function guard(event) {
    if (!sameOrigin(event.url, origin)) { event.preventDefault(); external(event.url, event.initiator?.url); }
  }
  contents.setWindowOpenHandler(({ url, referrer }) => { external(url, referrer?.url); return { action: 'deny' }; });
  contents.on('will-navigate', guard);
  contents.on('will-redirect', event => { if (event.isMainFrame) guard(event); });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('did-start-navigation', event => {
    if (event.isMainFrame && !event.isSameDocument) { committed = false; httpError = false; start(); }
  });
  contents.on('did-navigate', (_event, href, status) => {
    if (!sameOrigin(href, origin)) { committed = false; failure('Переход за пределы выбранного сервера заблокирован.'); return; }
    code = status; httpError = status >= 400;
    // A provisional navigation may become a download or be cancelled. Revoke
    // the active document only when Chromium has actually replaced it.
    changing();
    committed = (status >= 200 && status < 300 && status !== 204 && status !== 205) || status === 304 || status === 401;
    if (!committed) failure(`HTTP ${status}.`, true);
  });
  contents.on('did-finish-load', () => {
    const href = contents.getURL(); if (committed && sameOrigin(href, origin)) ready(href, code);
  });
  contents.on('did-fail-load', (_event, netCode, _text, _url, main) => {
    if (!main || netCode === -3 || (netCode === -379 && httpError)) return;
    committed = false;
    failure(netCode <= -200 && netCode > -300 ? 'Ошибка сертификата TLS. Обход проверки невозможен.' : `Ошибка загрузки страницы (${netCode}). Проверьте сеть и адрес.`);
  });
  contents.on('render-process-gone', () => { committed = false; failure('Процесс интерфейса завершился. Можно повторить загрузку.'); });
};
