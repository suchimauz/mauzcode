'use strict';
// Local setup/settings window only. Remote server pages never load this script or receive the desktopSetup bridge.
(() => {
  const $ = id => document.getElementById(id);
  const bridge = window.desktopSetup;
  const form = $('connection');
  const input = $('server');
  const allowHttp = $('allow-http');
  const httpWarning = $('http-warning');
  const formError = $('form-error');
  const actionError = $('action-error');
  const statusText = $('status');
  const ui = {
    connect: $('connect'), cancel: $('cancel'), back: $('back'), retry: $('retry'),
    micToggle: $('mic-toggle'), notifyToggle: $('notify-toggle'),
    updateCheck: $('update-check'), updateDownload: $('update-download'), updateRestart: $('update-restart'), updateLater: $('update-later')
  };
  let state = { url: '', status: '', connected: false, connecting: false, version: '', liveStatus: '', permissions: {}, update: { state: 'idle' } };
  let edited = false;
  let busy = false;

  const LIVE = { online: 'Связь с сервером есть.', connected: 'Связь с сервером есть.', reconnecting: 'Связь потеряна, переподключаемся…', offline: 'Связь с сервером потеряна. Чат переподключится, когда сеть вернётся.', unsupported: 'Сервер не сообщает о состоянии связи; при сбое используйте «Повторить подключение».' };
  const UPDATE = {
    idle: () => 'Проверка обновлений ещё не выполнялась.',
    checking: () => 'Проверяем обновления…',
    available: u => `Доступна версия ${u.version || 'новее текущей'}.`,
    downloading: u => `Скачиваем версию ${u.version || ''}…`.replace(' …', '…'),
    ready: u => `Версия ${u.version || ''} скачана и проверена. Она установится после перезапуска.`.replace('  ', ' '),
    deferred: u => `Обновление ${u.version || ''} отложено. Оно не установится само при обычном выходе — нажмите «Перезапустить и обновить», когда будете готовы.`.replace('  ', ' '),
    current: () => 'У вас последняя версия.',
    error: () => 'Не удалось проверить или скачать обновление. Установленная версия продолжает работать.',
    unavailable: () => 'Обновления для этой сборки недоступны.'
  };

  function isLoopback(host) {
    const h = host.replace(/^\[|\]$/g, '').toLowerCase();
    return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127(?:\.\d{1,3}){3}$/.test(h);
  }
  // Returns { url, insecureHttp } or { error } for the address currently typed by the user.
  function parseAddress(value) {
    const text = value.trim();
    if (!text) return { error: 'Введите адрес сервера, например https://mauzcode.example.com.' };
    let url;
    try { url = new URL(text); } catch { return { error: 'Адрес не распознан. Укажите его полностью, начиная с https:// или http://.' }; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'Поддерживаются только адреса https:// и http://.' };
    if (url.username || url.password) return { error: 'Уберите имя пользователя и пароль из адреса — войдите на странице сервера.' };
    return { url: text, insecureHttp: url.protocol === 'http:' && !isLoopback(url.hostname) };
  }

  function show(element, visible) { element.hidden = !visible; }
  function setError(element, message) { element.textContent = message || ''; show(element, Boolean(message)); }
  function refreshHttpWarning() {
    const parsed = parseAddress(input.value);
    const insecure = Boolean(parsed.insecureHttp);
    show(httpWarning, insecure);
    if (!insecure) allowHttp.checked = false;
  }
  // Keep keyboard focus on a visible control when a re-render hides the focused button.
  function keepFocus(previous) {
    if (!previous || previous === document.body || !previous.closest) return;
    if (!previous.hidden && !previous.disabled && !previous.closest('[hidden]')) return;
    const group = previous.closest('section') || document.querySelector('main');
    const next = [...group.querySelectorAll('button, input, summary')].find(el => !el.hidden && !el.disabled && !el.closest('[hidden]'));
    (next || input).focus();
  }

  function render(next) {
    const previous = document.activeElement;
    state = { ...state, ...(next || {}) };
    const permissions = state.permissions || {};
    const update = state.update || { state: 'idle' };
    const connecting = Boolean(state.connecting) || busy;
    // Follow the theme chosen on the server; without one, styles.css follows the system appearance.
    const theme = state.theme === 'light' || state.theme === 'dark' ? state.theme : 'system';
    if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
    if (!edited) input.value = state.url || '';
    refreshHttpWarning();
    show($('current'), Boolean(state.url));
    $('current-url').textContent = state.url || '';
    $('intro').textContent = state.url
      ? 'Здесь можно сменить сервер, проверить подключение, разрешения и обновления.'
      : 'Подключитесь к своему серверу MauzCode. Приложение не запускает сервер на этом компьютере.';
    const tone = connecting ? 'busy' : state.connected ? 'ok' : state.url ? 'warn' : 'idle';
    $('connection-state').dataset.tone = tone;
    $('connection-state').textContent = connecting ? 'Проверяем подключение…' : state.connected ? 'Подключено' : state.url ? 'Нет подключения' : 'Сервер не выбран';
    statusText.textContent = state.status || '';
    const live = typeof state.liveStatus === 'string' ? state.liveStatus : '';
    $('live-status').textContent = LIVE[live] || live;
    show($('live-status'), Boolean(live));

    ui.connect.disabled = connecting;
    input.readOnly = connecting;
    form.setAttribute('aria-busy', String(connecting));
    show(ui.cancel, connecting);
    show(ui.back, Boolean(state.url) && !connecting);
    ui.back.textContent = state.connected ? 'Вернуться к чату' : 'Вернуться к прежнему серверу';
    show(ui.retry, Boolean(state.url) && !connecting);

    const micSupported = permissions.microphoneSupported === true;
    $('mic-state').textContent = !micSupported
      ? (permissions.microphoneReason || 'Недоступен для этого сервера: микрофон работает только по HTTPS или на localhost.')
      : permissions.microphone ? 'Разрешён для текущего сервера. Диктовка работает в окне чата.' : 'Не разрешён. Без разрешения диктовка недоступна.';
    ui.micToggle.textContent = permissions.microphone ? 'Отозвать доступ' : 'Разрешить микрофон';
    ui.micToggle.dataset.action = permissions.microphone ? 'mic-revoke' : 'mic-grant';
    ui.micToggle.disabled = !micSupported && !permissions.microphone;

    const notifySupported = permissions.notificationSupport === true;
    $('notify-state').textContent = !notifySupported
      ? 'Сервер или система не поддерживают уведомления приложения.'
      : permissions.notifications ? 'Включены: сообщим о завершённых задачах и запросах ввода, когда окно в фоне.' : 'Выключены.';
    ui.notifyToggle.textContent = permissions.notifications ? 'Выключить уведомления' : 'Включить уведомления';
    ui.notifyToggle.dataset.action = permissions.notifications ? 'notifications-off' : 'notifications-on';
    ui.notifyToggle.disabled = !notifySupported && !permissions.notifications;

    $('version').textContent = state.version || 'неизвестна';
    const describe = UPDATE[update.state] || UPDATE.idle;
    $('update-state').textContent = update.message ? `${describe(update)} ${update.message}` : describe(update);
    $('update-state').dataset.tone = update.state === 'error' ? 'error' : update.state === 'ready' ? 'ok' : '';
    show(ui.updateCheck, ['idle', 'current', 'available', 'error'].includes(update.state));
    ui.updateCheck.disabled = update.state === 'checking';
    show(ui.updateDownload, update.state === 'available');
    show(ui.updateRestart, update.state === 'ready' || update.state === 'deferred');
    show(ui.updateLater, update.state === 'ready');
    keepFocus(previous);
  }

  async function run(action) {
    setError(actionError, '');
    try {
      const result = await bridge.action(action);
      if (!result || !result.ok) setError(actionError, (result && result.error) || 'Действие не выполнено. Повторите попытку.');
      return result;
    } catch {
      setError(actionError, 'Действие не выполнено. Повторите попытку.');
      return { ok: false };
    }
  }

  input.addEventListener('input', () => { edited = true; setError(formError, ''); refreshHttpWarning(); });
  allowHttp.addEventListener('change', () => setError(formError, ''));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const parsed = parseAddress(input.value);
    if (parsed.error) { setError(formError, parsed.error); input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    input.removeAttribute('aria-invalid');
    refreshHttpWarning();
    if (parsed.insecureHttp && !allowHttp.checked) {
      setError(formError, 'Подтвердите подключение без шифрования или укажите адрес HTTPS.');
      allowHttp.focus();
      return;
    }
    setError(formError, '');
    busy = true; render({ status: 'Проверяем сервер…' });
    try {
      const result = await bridge.connect(parsed.url, { allowHttp: parsed.insecureHttp ? allowHttp.checked : false });
      if (result && result.ok) { edited = false; }
      else render({ status: (result && result.error) || 'Не удалось подключиться. Сохранённый сервер не изменён.' });
    } catch {
      render({ status: 'Не удалось подключиться. Сохранённый сервер не изменён.' });
    } finally { busy = false; render(); }
  });
  ui.cancel.addEventListener('click', async () => { await run('cancel'); input.focus(); });
  ui.back.addEventListener('click', () => { edited = false; void run('back'); });
  ui.retry.addEventListener('click', () => { void run('retry'); });
  ui.micToggle.addEventListener('click', () => { void run(ui.micToggle.dataset.action); });
  ui.notifyToggle.addEventListener('click', () => { void run(ui.notifyToggle.dataset.action); });
  ui.updateCheck.addEventListener('click', () => { void run('update-check'); });
  ui.updateDownload.addEventListener('click', () => { void run('update-download'); });
  ui.updateRestart.addEventListener('click', () => { void run('update-restart'); });
  ui.updateLater.addEventListener('click', () => { void run('update-later'); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !ui.cancel.hidden) { event.preventDefault(); ui.cancel.click(); }
  });

  bridge.onState(render);
  bridge.getState().then(render).catch(() => { statusText.textContent = 'Не удалось прочитать настройки. Перезапустите приложение.'; });
  render();
})();
