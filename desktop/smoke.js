// Дымовой тест: запускает реальное приложение и проверяет ключевые сценарии.
// Запуск: npm run smoke  (в CI — на Linux и Windows). Выход 0 = всё хорошо, 1 = ошибка.
const { app } = require('electron');

module.exports = function smoke(ctx) {
  const errors = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wc = ctx.ui().webContents;

  const fail = (msg) => {
    console.error('SMOKE FAIL: ' + msg);
    app.exit(1);
  };
  const check = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const js = (code) => wc.executeJavaScript(code);

  // Событие console-message сменило сигнатуру в новых версиях Electron — поддерживаем оба варианта
  wc.on('console-message', (...a) => {
    const d = a[0] && a[0].message !== undefined ? a[0] : { level: a[1], message: a[2] };
    if (d.level === 'error' || d.level === 3) errors.push('UI console: ' + d.message);
  });
  wc.on('preload-error', (_e, file, err) => errors.push('preload ' + file + ': ' + (err && err.message)));
  wc.on('render-process-gone', (_e, d) => errors.push('UI renderer gone: ' + d.reason));

  setTimeout(() => fail('timeout 90s'), 90000);

  (async () => {
    try {
      console.log('electron ' + process.versions.electron + ', chromium ' + process.versions.chrome + ', ' + process.platform);
      await sleep(4000);

      check(!wc.isLoading(), 'UI не загрузился');
      check(ctx.tabs.size === 1, 'ожидалась 1 вкладка, а их ' + ctx.tabs.size);
      check((await js("document.querySelectorAll('.tab').length")) === 1, 'вкладка не отрисована в интерфейсе');
      check(ctx.adblockStats().rules > 0, 'blocklist не загружен');
      const first = [...ctx.tabs.values()][0];
      check(first.view && first.view.webContents.getURL().startsWith('file:'), 'стартовая страница не открылась');

      // Панель Lumen Control
      await js("document.querySelector('[data-panel=control]').click()");
      await sleep(800);
      check(await js("!document.querySelector('#panel').hidden && document.querySelectorAll('#panel .sw').length >= 3"), 'панель Control не открылась');
      await js("document.querySelector('[data-panel=control]').click()");

      // Новая вкладка
      await js("document.querySelector('#newtab').click()");
      await sleep(1500);
      check(ctx.tabs.size === 2, 'новая вкладка не создалась');

      // Усыпление и пробуждение фоновой вкладки
      ctx.sleepTab(first);
      check(first.sleeping && !first.view, 'вкладка не уснула');
      ctx.activate(first.id);
      await sleep(1500);
      check(!first.sleeping && first.view, 'вкладка не проснулась');

      // Настройки через IPC
      const s = await js("lumen.setSettings({ forceDark: true, accent: '#ff0066' })");
      check(s && s.forceDark === true && s.accent === '#ff0066', 'settings:set не работает');

      // Оформление, запуск, масштаб
      await js("document.querySelector('[data-panel=settings]').click()");
      await sleep(500);
      check(await js("!document.querySelector('#panel').hidden && document.body.innerText.includes('Оформление')"), 'панель оформления не открылась');
      const look = await js("lumen.setSettings({ theme: 'paper', wallpaper: 'ocean', startup: 'bookmarks', uiScale: 120, fontScale: 110, pageZoom: 80, sidebar: false })");
      check(look && look.theme === 'paper' && look.wallpaper === 'ocean' && look.startup === 'bookmarks' && look.uiScale === 120 && look.pageZoom === 80 && look.sidebar === false, 'новые настройки оформления');
      await sleep(300);
      check(await js("document.body.classList.contains('nosidebar')"), 'боковая панель не скрылась');
      await js("lumen.setSettings({ theme: 'system', wallpaper: 'dusk', startup: 'newtab', uiScale: 100, fontScale: 100, pageZoom: 100, sidebar: true, forceDark: true, accent: '#ff0066' })");
      await sleep(300);

      // Менеджер паролей: в списке нет секрета, раскрытие работает
      await js("document.querySelector('[data-panel=passwords]').click()");
      await sleep(400);
      check(await js("document.body.innerText.includes('Пароли')"), 'панель паролей не открылась');
      const vault = await js("(async () => { const save = await lumen.pwSave({ origin: 'https://example.com', username: 'ada', password: 's3cret' }); const list = await lumen.passwords(); const pw = list[0] ? await lumen.pwReveal(list[0].id) : ''; if (list[0]) lumen.pwRemove(list[0].id); await new Promise((r) => setTimeout(r, 80)); const left = await lumen.passwords(); return { ok: !!(save && save.ok), n: list.length, keys: list[0] ? Object.keys(list[0]).join(',') : '', pw, left: left.length }; })()");
      check(vault && vault.ok && vault.n === 1 && vault.pw === 's3cret' && vault.left === 0 && vault.keys.indexOf('secret') < 0 && vault.keys.indexOf('password') < 0, 'менеджер паролей: ' + JSON.stringify(vault));

      await js("document.querySelector('[data-panel=downloads]').click()");
      await sleep(300);
      check(await js("document.body.innerText.includes('Загрузки')"), 'панель загрузок не открылась');
      await js("document.querySelector('[data-panel=downloads]').click()");

      // Закрытие вкладки крестиком
      await js("document.querySelector('.tab .x').click()");
      await sleep(800);
      check(ctx.tabs.size === 1, 'вкладка не закрылась');

      check(errors.length === 0, errors.join('\n'));
      console.log('SMOKE OK');
      app.exit(0);
    } catch (e) {
      fail(e.message + (errors.length ? '\n' + errors.join('\n') : ''));
    }
  })();
};
