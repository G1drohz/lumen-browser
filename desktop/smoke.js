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
