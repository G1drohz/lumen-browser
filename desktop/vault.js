const { safeStorage } = require('electron');

/** Доступно ли настоящее шифрование ОС (DPAPI / Keychain / libsecret или kwallet). */
function vaultSecure() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // На Linux без связки ключей Electron тихо переходит на «basic_text» — это не шифрование.
    if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
      return safeStorage.getSelectedStorageBackend() !== 'basic_text';
    }
    return true;
  } catch {
    return false;
  }
}

/** Шифрует строку средствами ОС. Без хранилища ключей пароль НЕ сохраняется (раньше он ложился в base64). */
function seal(text) {
  if (!vaultSecure()) throw new Error('Системное хранилище ключей недоступно');
  return 'enc:' + safeStorage.encryptString(String(text)).toString('base64');
}

/** Читает запись. Старый формат b64: поддерживается только для миграции в enc:. */
function openSeal(stored) {
  try {
    if (typeof stored !== 'string') return '';
    if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
  } catch { /* повреждённая запись */ }
  return '';
}

module.exports = { seal, openSeal, vaultSecure };
