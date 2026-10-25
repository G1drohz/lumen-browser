package dev.g1drohz.lumen

import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.util.Base64
import androidx.appcompat.app.AppCompatDelegate
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Настройки, обои, пароли и список загрузок. Общие для экранов браузера. */
object Store {
    data class Palette(val mode: String, val bg: Int, val fg: Int, val mute: Int, val pill: Int, val accent: Int)

    private fun p(ctx: Context) = ctx.getSharedPreferences("lumen", Context.MODE_PRIVATE)

    fun str(ctx: Context, key: String, fallback: String) = p(ctx).getString(key, fallback) ?: fallback
    fun int(ctx: Context, key: String, fallback: Int) = p(ctx).getInt(key, fallback)
    fun putStr(ctx: Context, key: String, value: String) { p(ctx).edit().putString(key, value).apply() }
    fun putInt(ctx: Context, key: String, value: Int) { p(ctx).edit().putInt(key, value).apply() }

    fun nightMode(ctx: Context): Int = when (str(ctx, "theme", "system")) {
        "light", "paper" -> AppCompatDelegate.MODE_NIGHT_NO
        "dark", "gx", "aurora", "ember", "ocean" -> AppCompatDelegate.MODE_NIGHT_YES
        else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
    }

    fun brandAccent(id: String): String? = when (id) {
        "gx" -> "#ff2bd6"
        "aurora" -> "#3dffc8"
        "ember" -> "#ff6a3d"
        "ocean" -> "#4aa8ff"
        "paper" -> "#c4552a"
        else -> null
    }

    fun palette(ctx: Context): Palette {
        val night = (ctx.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
            android.content.res.Configuration.UI_MODE_NIGHT_YES
        val accent = parse(str(ctx, "accent", "#7C5CFF"), Color.parseColor("#7C5CFF"))
        fun pack(mode: String, bg: String, fg: String, mute: String, pill: String) =
            Palette(mode, Color.parseColor(bg), Color.parseColor(fg), Color.parseColor(mute), Color.parseColor(pill), accent)
        return when (str(ctx, "theme", "system")) {
            "light" -> pack("light", "#F5F5F7", "#1D1D1F", "#6E6E73", "#FFFFFF")
            "dark" -> pack("dark", "#1C1C20", "#F2F2F5", "#9A9AA5", "#34343B")
            "gx" -> pack("dark", "#120812", "#FFE8FB", "#C892BC", "#2A142E")
            "aurora" -> pack("dark", "#071410", "#E7FFF6", "#8DCEBB", "#12302A")
            "ember" -> pack("dark", "#160E0A", "#FFF1EA", "#D7A894", "#321C14")
            "ocean" -> pack("dark", "#071018", "#E7F3FF", "#8EB0D4", "#12283E")
            "paper" -> pack("light", "#F6F1E7", "#2C2416", "#7A6A55", "#FFFAF2")
            else -> if (night) pack("dark", "#1C1C20", "#F2F2F5", "#9A9AA5", "#34343B")
            else pack("light", "#F5F5F7", "#1D1D1F", "#6E6E73", "#FFFFFF")
        }
    }

    fun launchTarget(ctx: Context): String = when (str(ctx, "startup", "newtab")) {
        "blank" -> "about:blank"
        "site" -> {
            val home = str(ctx, "homeUrl", "").trim()
            if (home.isEmpty()) MainActivity.HOME else toUrl(home)
        }
        "bookmarks" -> MainActivity.HOME_BM
        else -> MainActivity.HOME
    }

    fun toUrl(input: String): String {
        val s = input.trim()
        if (s.isEmpty()) return MainActivity.HOME
        if (Regex("https?://.*", RegexOption.IGNORE_CASE).matches(s)) return s
        if (Regex("(localhost|[\\w-]+(\\.[\\w-]+)+)(:\\d+)?([/?#].*)?", RegexOption.IGNORE_CASE).matches(s)) return "https://$s"
        return "https://duckduckgo.com/?q=" + Uri.encode(s)
    }

    fun decorateStart(ctx: Context, html: String, bookmarksMode: Boolean): String {
        val pal = palette(ctx)
        val wall = str(ctx, "wallpaper", "dusk")
        val cfg = JSONObject()
            .put("accent", String.format("#%06X", pal.accent and 0xFFFFFF))
            .put("mode", pal.mode)
            .put("wallpaper", wall)
            .put("image", if (wall == "custom") wallpaperData(ctx) else "")
            .put("bookmarksMode", bookmarksMode)
            .put("fontScale", int(ctx, "fontScale", 100).coerceIn(80, 160))
            .put("bookmarks", bookmarkPayload(ctx))
        val json = cfg.toString().replace("<", "\\u003c")
        return html.replace("</body>", "<script>window.applyLumen&&window.applyLumen($json)</script></body>")
    }

    fun saveWallpaper(ctx: Context, uri: Uri): Boolean {
        val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return false
        if (bytes.size !in 32..2_500_000) return false
        val mime = imageMime(bytes) ?: return false
        ctx.openFileOutput("wallpaper", Context.MODE_PRIVATE).use { it.write(bytes) }
        p(ctx).edit().putString("wallpaper", "custom").putString("wallMime", mime).apply()
        return true
    }

    fun clearWallpaper(ctx: Context) {
        File(ctx.filesDir, "wallpaper").delete()
        p(ctx).edit().remove("wallMime").putString("wallpaper", "dusk").apply()
    }

    private fun bookmarkPayload(ctx: Context): JSONArray {
        val src = try { JSONArray(str(ctx, "bookmarks", "[]")) } catch (_: Exception) { JSONArray() }
        val out = JSONArray()
        for (i in 0 until minOf(src.length(), 24)) {
            val o = src.optJSONObject(i) ?: continue
            val url = o.optString("u")
            if (!url.startsWith("http://") && !url.startsWith("https://")) continue
            out.put(JSONObject().put("title", o.optString("t")).put("url", url))
        }
        return out
    }

    private fun wallpaperData(ctx: Context): String {
        val file = File(ctx.filesDir, "wallpaper")
        if (!file.exists() || file.length() !in 1..2_500_000) return ""
        val mime = str(ctx, "wallMime", "png")
        if (mime !in setOf("png", "jpeg", "webp", "gif")) return ""
        return "data:image/$mime;base64," + Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
    }

    private fun imageMime(bytes: ByteArray): String? {
        if (bytes.size > 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte()) return "jpeg"
        if (bytes.size > 8 && bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte()) return "png"
        if (bytes.size > 6 && bytes[0] == 0x47.toByte() && bytes[1] == 0x49.toByte() && bytes[2] == 0x46.toByte()) return "gif"
        if (bytes.size > 12 && bytes[0] == 0x52.toByte() && bytes[1] == 0x49.toByte() && bytes[2] == 0x46.toByte() && bytes[3] == 0x46.toByte()) return "webp"
        return null
    }

    fun passwords(ctx: Context): JSONArray =
        try { JSONArray(str(ctx, "passwords", "[]")) } catch (_: Exception) { JSONArray() }

    fun upsertPassword(ctx: Context, origin: String, username: String, password: String): Boolean {
        val o = validOrigin(origin)
        if (o.isEmpty() || password.isEmpty() || password.length > 500) return false
        val user = username.take(200)
        val arr = passwords(ctx)
        var replaced = false
        for (i in 0 until arr.length()) {
            val row = arr.getJSONObject(i)
            if (row.optString("origin") == o && row.optString("username") == user) {
                row.put("secret", Vault.seal(password))
                row.put("updated", System.currentTimeMillis())
                replaced = true
            }
        }
        if (!replaced) {
            val row = JSONObject()
                .put("id", java.util.UUID.randomUUID().toString().substring(0, 8))
                .put("origin", o)
                .put("username", user)
                .put("secret", Vault.seal(password))
                .put("updated", System.currentTimeMillis())
            val merged = JSONArray()
            merged.put(row)
            for (i in 0 until arr.length()) merged.put(arr.getJSONObject(i))
            putStr(ctx, "passwords", merged.toString())
            return true
        }
        putStr(ctx, "passwords", arr.toString())
        return true
    }

    fun removePassword(ctx: Context, id: String) {
        val arr = passwords(ctx)
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val row = arr.getJSONObject(i)
            if (row.optString("id") != id) out.put(row)
        }
        putStr(ctx, "passwords", out.toString())
    }

    fun reveal(ctx: Context, id: String): String {
        val arr = passwords(ctx)
        for (i in 0 until arr.length()) {
            val row = arr.getJSONObject(i)
            if (row.optString("id") == id) return Vault.open(row.optString("secret"))
        }
        return ""
    }

    fun samePassword(ctx: Context, origin: String, username: String, password: String): Boolean {
        val arr = passwords(ctx)
        for (i in 0 until arr.length()) {
            val row = arr.getJSONObject(i)
            if (row.optString("origin") == origin && row.optString("username") == username) {
                return Vault.open(row.optString("secret")) == password
            }
        }
        return false
    }

    fun neverAsk(ctx: Context, origin: String) {
        val arr = never(ctx)
        for (i in 0 until arr.length()) if (arr.optString(i) == origin) return
        arr.put(origin)
        putStr(ctx, "pwNever", arr.toString())
    }

    fun clearNever(ctx: Context) { p(ctx).edit().remove("pwNever").apply() }

    fun isNever(ctx: Context, origin: String): Boolean {
        val arr = never(ctx)
        for (i in 0 until arr.length()) if (arr.optString(i) == origin) return true
        return false
    }

    private fun never(ctx: Context) = try { JSONArray(str(ctx, "pwNever", "[]")) } catch (_: Exception) { JSONArray() }

    fun rememberDownload(ctx: Context, id: Long, name: String, url: String) {
        val arr = downloads(ctx)
        val row = JSONObject().put("id", id).put("name", name).put("url", url).put("t", System.currentTimeMillis())
        val out = JSONArray().put(row)
        for (i in 0 until minOf(arr.length(), 49)) out.put(arr.getJSONObject(i))
        putStr(ctx, "downloads", out.toString())
    }

    fun downloads(ctx: Context): JSONArray =
        try { JSONArray(str(ctx, "downloads", "[]")) } catch (_: Exception) { JSONArray() }

    fun clearDownloads(ctx: Context) { p(ctx).edit().remove("downloads").apply() }

    fun validOrigin(raw: String): String {
        val u = Uri.parse(raw.trim())
        val scheme = u.scheme?.lowercase() ?: return ""
        if (scheme != "http" && scheme != "https") return ""
        val host = u.host ?: return ""
        val port = if (u.port > 0) ":${u.port}" else ""
        return "$scheme://$host$port"
    }

    private fun parse(hex: String, fallback: Int) = try { Color.parseColor(hex) } catch (_: Exception) { fallback }

    const val PW_HOOK = """(function(){if(window.__lumenPw)return;window.__lumenPw=1;document.addEventListener('submit',function(ev){var form=ev.target;if(!form||!form.querySelector)return;var pw=form.querySelector('input[type=password]');if(!pw||!pw.value)return;var user=form.querySelector('input[type=email],input[type=text],input[autocomplete=username]');console.log('LUMEN_PW_SAVE '+JSON.stringify({origin:location.origin,username:user?user.value:'',password:pw.value}));},true);})();"""

    fun fillJs(username: String, password: String): String {
        val cred = JSONObject().put("username", username).put("password", password).toString().replace("<", "\\u003c")
        return "(function(){var cred=$cred;var pw=document.querySelector('input[type=password]');if(!pw)return false;var scope=pw.form||document;var user=scope.querySelector('input[type=email],input[type=text],input[autocomplete=username]');function set(el,v){if(!el)return;var proto=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');if(proto&&proto.set)proto.set.call(el,v);else el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}set(user,cred.username);set(pw,cred.password);return true;})()"
    }
}
