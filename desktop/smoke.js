// Дымовой тест: запускает реальное приложение и проверяет ключевые сценарии.
// Запуск: npm run smoke  (в CI — перед сборкой установщика)
'use strict';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = async function smoke(ctx) {
  const { ui, tabs, newTab, activate, sleepTab, adblockStats } = ctx;
  const fail = (msg) => {
    console.error('SMOKE FAIL: ' + msg);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 200);
    throw new Error(msg);
  };
  const check = (ok, msg) => {
    if (!ok) fail(msg);
  };
  const js = async (code) => {
    const view = ui();
    if (!view || !view.webContents) fail('UI webContents недоступен');
    return view.webContents.executeJavaScript(code, true);
  };

  try {
    await sleep(1200);
    check(tabs && tabs.size >= 1, 'нет вкладок');
    const first = [...tabs.values()][0];
    check(first.view && first.view.webContents.getURL().startsWith('file:'), 'стартовая страница не открылась');

    // Панель Lumen Control
    await js("document.querySelector('[data-panel=control]').click()");
    await sleep(800);
    check(
      await js("!document.querySelector('#panel').hidden && document.body.innerText.includes('Lumen Control')"),
      'панель Control не открылась'
    );
    await js("document.querySelector('[data-panel=control]').click()");

    // Новая вкладка
    await js("document.querySelector('#newtab').click()");
    await sleep(500);
    check(tabs.size >= 2, 'новая вкладка не создалась');

    // Настройки
    await js("document.querySelector('[data-panel=settings]').click()");
    await sleep(600);
    check(
      await js("!document.querySelector('#panel').hidden && document.body.innerText.includes('Оформление')"),
      'панель оформления не открылась'
    );

    // Пароли
    await js("document.querySelector('[data-panel=passwords]').click()");
    await sleep(400);

    // Загрузки
    await js("document.querySelector('[data-panel=downloads]').click()");
    await sleep(400);
    await js("document.querySelector('[data-panel=downloads]').click()");

    console.log('SMOKE OK');
    setTimeout(() => process.exit(0), 300);
  } catch (e) {
    if (process.exitCode !== 1) {
      console.error('SMOKE FAIL:', e && e.message ? e.message : e);
      process.exitCode = 1;
      setTimeout(() => process.exit(1), 200);
    }
  }
};
