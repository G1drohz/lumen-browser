#!/usr/bin/env python3
from pathlib import Path

main = Path("desktop/main.js")
m = main.read_text()
m = m.replace("const WALL_MAX = 12 * 1024 * 1024;", "const WALL_MAX = 30 * 1024 * 1024;")
m = m.replace("WALL_MAX = 12 * 1024 * 1024", "WALL_MAX = 30 * 1024 * 1024")

old = """function saveWallpaper(dataUrl) {
  const m = /^data:image\\/(png|jpeg|jpg|webp|gif);base64,([a-z0-9+/=\\s]+)$/i.exec(String(dataUrl || ''));
  if (!m) return false;
  let buf = Buffer.from(m[2].replace(/\\s/g, ''), 'base64');
  let mime = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
  if (!buf.length || buf.length > WALL_MAX) return false;
  if (mime === 'png' || mime === 'jpeg') {
    try {
      // Большие картинки ужимаем до 2560 px: так быстрее открывается каждая новая вкладка
      let img = nativeImage.createFromBuffer(buf);
      if (!img.isEmpty() && img.getSize().width > 2560) {
        img = img.resize({ width: 2560, quality: 'good' });
        buf = img.toJPEG(88);
        mime = 'jpeg';
      }
    } catch { /* оставляем оригинал */ }
  }
  fs.writeFileSync(wallFile(), buf);
  fs.writeFileSync(wallFile() + '.mime', mime);
  wallCache = null;
  return true;
}"""

new = """function saveWallpaper(dataUrl) {
  const raw = String(dataUrl || '').trim();
  const m = /^data:image\\/([a-z0-9.+-]+)(?:;[^,]*)?;base64,([\\s\\S]+)$/i.exec(raw);
  if (!m) return { ok: false, error: 'format' };
  let mime = m[1].toLowerCase().replace(/^x-/, '');
  if (mime === 'jpg') mime = 'jpeg';
  if (mime === 'svg+xml') return { ok: false, error: 'format' };
  if (!/^(png|jpeg|webp|gif)$/.test(mime)) return { ok: false, error: 'format' };
  let buf;
  try {
    buf = Buffer.from(m[2].replace(/\\s/g, ''), 'base64');
  } catch {
    return { ok: false, error: 'format' };
  }
  if (!buf.length) return { ok: false, error: 'empty' };
  try {
    let img = nativeImage.createFromBuffer(buf);
    if (!img.isEmpty()) {
      const { width, height } = img.getSize();
      const tooBig = width > 2560 || height > 2560 || buf.length > 6 * 1024 * 1024;
      if (tooBig) {
        const scale = Math.min(1, 2560 / Math.max(width, height, 1));
        const w = Math.max(1, Math.round(width * scale));
        img = img.resize({ width: w, quality: 'good' });
        buf = img.toJPEG(85);
        mime = 'jpeg';
      }
    }
  } catch { /* оригинал */ }
  if (buf.length > WALL_MAX) return { ok: false, error: 'size' };
  try {
    fs.writeFileSync(wallFile(), buf);
    fs.writeFileSync(wallFile() + '.mime', mime);
  } catch {
    return { ok: false, error: 'write' };
  }
  wallCache = null;
  return { ok: true };
}"""

if "error: 'format'" not in m and old in m:
    m = m.replace(old, new, 1)
    print("saveWallpaper ok")
elif "error: 'format'" in m:
    print("saveWallpaper already new")
else:
    raise SystemExit("saveWallpaper block missing")

old_h = """handle('wall:set', (dataUrl) => {
  const ok = saveWallpaper(dataUrl);
  if (ok) data.settings = sanitizeSettings(data.settings, { wallpaper: 'custom' });
  save();
  for (const t of tabs.values()) decorateStart(t).catch(() => {});
  pushState();
  return ok;
});"""

new_h = """handle('wall:set', (dataUrl) => {
  const result = saveWallpaper(dataUrl);
  const ok = !!(result && result.ok);
  if (ok) data.settings = sanitizeSettings(data.settings, { wallpaper: 'custom' });
  save();
  if (ok) for (const t of tabs.values()) decorateStart(t).catch(() => {});
  pushState();
  return result && typeof result === 'object' ? result : { ok: false, error: 'format' };
});"""

if "result && result.ok" not in m:
    if old_h not in m:
        raise SystemExit("wall:set handler missing")
    m = m.replace(old_h, new_h, 1)
    print("handler ok")
else:
    print("handler already new")

main.write_text(m)

app = Path("desktop/renderer/app.js")
a = app.read_text()
old_ui = """    reader.onload = async () => {
      const ok = await lumen.wallSet(String(reader.result || ''));
      if (ok) paintSettings();
      else alert('Не удалось сохранить обои. Нужен PNG, JPEG, WebP или GIF.');
    };"""
new_ui = """    reader.onload = async () => {
      const res = await lumen.wallSet(String(reader.result || ''));
      const ok = res === true || (res && res.ok);
      if (ok) {
        paintSettings();
        return;
      }
      const err = res && res.error;
      if (err === 'size') alert('Файл слишком большой. Нужно изображение до 30 МБ (крупные PNG автоматически ужимаются).');
      else if (err === 'write') alert('Не удалось записать файл обоев. Проверьте права на папку приложения.');
      else alert('Не удалось сохранить обои. Поддерживаются PNG, JPEG, WebP и GIF.');
    };"""
if "res && res.ok" not in a:
    if old_ui not in a:
        raise SystemExit("app wallSet UI missing")
    a = a.replace(old_ui, new_ui, 1)
    print("ui ok")
else:
    print("ui already new")

a = a.replace(
    "accept: 'image/png,image/jpeg,image/jpg,image/webp,image/gif'",
    "accept: 'image/png,image/x-png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif'",
)
app.write_text(a)

pkg = Path("desktop/package.json")
if pkg.exists():
    t = pkg.read_text()
    t2 = t.replace('"version": "3.2.1"', '"version": "3.2.2"').replace('"version": "3.2.0"', '"version": "3.2.2"')
    pkg.write_text(t2)
    print("version 3.2.2")
print("done")
