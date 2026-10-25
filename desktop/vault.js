const { safeStorage } = require('electron');

/** Шифрует строку средствами ОС (DPAPI / Keychain / libsecret). Если их нет — прячет в base64. */
function seal(text) {
  const value = String(text);
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(value).toString('base64');
    }
  } catch { /* остаётся запасной вариант ниже */ }
  return 'b64:' + Buffer.from(value, 'utf8').toString('base64');
}

function openSeal(stored) {
  try {
    if (typeof stored !== 'string') return '';
    if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
  } catch { /* повреждённая запись */ }
  return '';
}

function vaultSecure() {
  try { return !!safeStorage.isEncryptionAvailable(); } catch { return false; }
}

module.exports = { seal, openSeal, vaultSecure };
