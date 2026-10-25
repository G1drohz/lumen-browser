package dev.g1drohz.lumen

import android.app.AlertDialog
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import org.json.JSONObject

/** Диалоги настроек, паролей, загрузок и поиска. Интерфейс собирается кодом, как и остальной Android-клиент. */
object Panels {
    private fun dp(a: MainActivity, v: Int) = (v * a.resources.displayMetrics.density).toInt()

    private fun label(a: MainActivity, text: String, size: Float, color: Int, padTop: Int = 0) = TextView(a).apply {
        this.text = text
        textSize = size
        setTextColor(color)
        setPadding(0, dp(a, padTop), 0, dp(a, 4))
    }

    fun settings(a: MainActivity) {
        val pal = Store.palette(a)
        val box = LinearLayout(a).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(a, 18), dp(a, 6), dp(a, 18), dp(a, 12))
        }
        box.addView(label(a, "ТЕМА", 12f, pal.mute, 8))
        val themes = listOf(
            "system" to "Как в системе", "light" to "Светлая", "dark" to "Тёмная",
            "gx" to "GX", "aurora" to "Аврора", "ember" to "Уголь", "ocean" to "Океан", "paper" to "Бумага",
        )
        val current = Store.str(a, "theme", "system")
        themes.forEach { (id, title) ->
            box.addView(TextView(a).apply {
                text = if (id == current) "● $title" else "○ $title"
                textSize = 16f
                setTextColor(pal.fg)
                setPadding(0, dp(a, 8), 0, dp(a, 8))
                setOnClickListener {
                    Store.putStr(a, "theme", id)
                    Store.brandAccent(id)?.let { Store.putStr(a, "accent", it) }
                    a.onSettingsChanged(true)
                }
            })
        }
        box.addView(label(a, "ОБОИ НОВОЙ ВКЛАДКИ", 12f, pal.mute, 12))
        val walls = listOf(
            "none" to "Нет", "dusk" to "Сумерки", "aurora" to "Сияние", "ember" to "Угли",
            "ocean" to "Глубина", "forest" to "Лес", "mesh" to "Сетка", "grid" to "Клетка",
        )
        val wall = Store.str(a, "wallpaper", "dusk")
        walls.forEach { (id, title) ->
            box.addView(TextView(a).apply {
                text = if (id == wall) "● $title" else "○ $title"
                textSize = 16f
                setTextColor(pal.fg)
                setPadding(0, dp(a, 6), 0, dp(a, 6))
                setOnClickListener {
                    Store.putStr(a, "wallpaper", id)
                    a.onSettingsChanged(false)
                    a.reloadStartPages()
                }
            })
        }
        box.addView(TextView(a).apply {
            text = "Загрузить своё изображение"
            textSize = 16f
            setTextColor(pal.accent)
            setPadding(0, dp(a, 8), 0, dp(a, 4))
            setOnClickListener { a.launchWallpaperPicker() }
        })
        if (wall == "custom") {
            box.addView(TextView(a).apply {
                text = "Убрать своё изображение"
                textSize = 16f
                setTextColor(pal.mute)
                setPadding(0, dp(a, 4), 0, dp(a, 4))
                setOnClickListener {
                    Store.clearWallpaper(a)
                    a.reloadStartPages()
                }
            })
        }
        box.addView(label(a, "ПРИ ЗАПУСКЕ", 12f, pal.mute, 12))
        val startup = Store.str(a, "startup", "newtab")
        listOf(
            "newtab" to "Страница Lumen",
            "blank" to "Пустая вкладка",
            "site" to "Сайт по умолчанию",
            "bookmarks" to "Набор закладок",
        ).forEach { (id, title) ->
            box.addView(TextView(a).apply {
                text = if (id == startup) "● $title" else "○ $title"
                textSize = 16f
                setTextColor(pal.fg)
                setPadding(0, dp(a, 6), 0, dp(a, 6))
                setOnClickListener { Store.putStr(a, "startup", id); a.onSettingsChanged(false) }
            })
        }
        val home = EditText(a).apply {
            setText(Store.str(a, "homeUrl", ""))
            hint = "https://example.com"
            setSingleLine()
            setTextColor(pal.fg)
            setHintTextColor(pal.mute)
        }
        box.addView(home)
        box.addView(label(a, "ШРИФТ СТРАНИЦ ${Store.int(a, "fontScale", 100)}%", 12f, pal.mute, 14))
        val font = SeekBar(a).apply {
            max = 80
            progress = Store.int(a, "fontScale", 100).coerceIn(80, 160) - 80
        }
        box.addView(font)
        box.addView(label(a, "МАСШТАБ СТРАНИЦ ${Store.int(a, "pageZoom", 100)}%", 12f, pal.mute, 8))
        val zoom = SeekBar(a).apply {
            max = 150
            progress = Store.int(a, "pageZoom", 100).coerceIn(50, 200) - 50
        }
        box.addView(zoom)
        val scroll = ScrollView(a).apply { addView(box) }
        AlertDialog.Builder(a)
            .setTitle("Оформление")
            .setView(scroll)
            .setPositiveButton("Готово") { _, _ ->
                Store.putStr(a, "homeUrl", home.text.toString().trim())
                Store.putInt(a, "fontScale", 80 + font.progress)
                Store.putInt(a, "pageZoom", 50 + zoom.progress)
                a.onSettingsChanged(false)
            }
            .setNegativeButton("Закрыть", null)
            .show()
    }

    fun passwords(a: MainActivity) {
        val arr = Store.passwords(a)
        val titles = Array(arr.length()) { i ->
            val o = arr.getJSONObject(i)
            val user = o.optString("username").ifBlank { "без логина" }
            user + " — " + o.optString("origin").removePrefix("https://").removePrefix("http://")
        }
        val dialog = AlertDialog.Builder(a)
            .setTitle(if (arr.length() == 0) "Пароли" else "Пароли (${arr.length()})")
            .setItems(titles) { _, i -> passwordActions(a, arr.getJSONObject(i)) }
            .setPositiveButton("Добавить") { _, _ -> editPassword(a, null) }
            .setNeutralButton("Снова спрашивать") { _, _ -> Store.clearNever(a) }
            .setNegativeButton("Закрыть", null)
            .create()
        dialog.show()
    }

    private fun passwordActions(a: MainActivity, row: JSONObject) {
        val id = row.optString("id")
        AlertDialog.Builder(a)
            .setTitle(row.optString("origin"))
            .setItems(arrayOf("Подставить на страницу", "Показать", "Удалить")) { _, which ->
                when (which) {
                    0 -> a.web().evaluateJavascript(Store.fillJs(row.optString("username"), Store.reveal(a, id)), null)
                    1 -> AlertDialog.Builder(a).setTitle(row.optString("username").ifBlank { "Пароль" })
                        .setMessage(Store.reveal(a, id).ifBlank { "Не удалось расшифровать" })
                        .setPositiveButton("OK", null).show()
                    2 -> { Store.removePassword(a, id); passwords(a) }
                }
            }
            .setNegativeButton("Назад") { _, _ -> passwords(a) }
            .show()
    }

    private fun editPassword(a: MainActivity, presetOrigin: String?) {
        val pal = Store.palette(a)
        val origin = EditText(a).apply { hint = "Сайт"; setText(presetOrigin ?: ""); setSingleLine(); setTextColor(pal.fg) }
        val user = EditText(a).apply { hint = "Логин"; setSingleLine(); setTextColor(pal.fg) }
        val pass = EditText(a).apply { hint = "Пароль"; setSingleLine(); inputType = android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD; setTextColor(pal.fg) }
        val box = LinearLayout(a).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(a, 18), dp(a, 8), dp(a, 18), 0)
            addView(origin); addView(user); addView(pass)
        }
        AlertDialog.Builder(a)
            .setTitle("Новый пароль")
            .setView(box)
            .setPositiveButton("Сохранить") { _, _ ->
                var o = origin.text.toString().trim()
                if (o.isNotEmpty() && !o.contains("://")) o = "https://$o"
                if (!Store.upsertPassword(a, o, user.text.toString(), pass.text.toString())) a.toast("Проверьте адрес и пароль")
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    fun downloads(a: MainActivity) {
        val dm = a.getSystemService(android.content.Context.DOWNLOAD_SERVICE) as android.app.DownloadManager
        val arr = Store.downloads(a)
        if (arr.length() == 0) {
            a.toast("Загрузок пока нет")
            return
        }
        val titles = Array(arr.length()) { i -> arr.getJSONObject(i).optString("name").ifBlank { "Файл" } }
        AlertDialog.Builder(a)
            .setTitle("Загрузки")
            .setItems(titles) { _, i ->
                val id = arr.getJSONObject(i).optLong("id")
                val uri = try { dm.getUriForDownloadedFile(id) } catch (_: Exception) { null }
                if (uri == null) {
                    a.toast("Файл ещё скачивается или уже удалён")
                    return@setItems
                }
                val view = android.content.Intent(android.content.Intent.ACTION_VIEW).setData(uri)
                    .addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                try { a.startActivity(view) } catch (_: Exception) { a.toast("Нет приложения, чтобы открыть файл") }
            }
            .setPositiveButton("Папка загрузок") { _, _ ->
                try { a.startActivity(android.content.Intent(android.app.DownloadManager.ACTION_VIEW_DOWNLOADS)) } catch (_: Exception) {}
            }
            .setNeutralButton("Очистить список") { _, _ -> Store.clearDownloads(a) }
            .setNegativeButton("Закрыть", null)
            .show()
    }

    fun find(a: MainActivity) {
        val input = EditText(a).apply {
            hint = "Найти на странице"
            setSingleLine()
            setPadding(dp(a, 16), dp(a, 8), dp(a, 16), dp(a, 8))
        }
        val dialog = AlertDialog.Builder(a)
            .setTitle("Найти")
            .setView(input)
            .setPositiveButton("Найти", null)
            .setNegativeButton("Дальше", null)
            .setNeutralButton("Закрыть") { _, _ -> a.web().clearMatches() }
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                a.web().findAllAsync(input.text.toString())
            }
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener {
                a.web().findNext(true)
            }
        }
        dialog.show()
    }

    fun offerPassword(a: MainActivity, origin: String, username: String, password: String, update: Boolean) {
        if (a.isFinishing) return
        val host = origin.removePrefix("https://").removePrefix("http://")
        val who = if (username.isBlank()) host else "$username — $host"
        AlertDialog.Builder(a)
            .setTitle(if (update) "Обновить пароль?" else "Сохранить пароль?")
            .setMessage(who)
            .setPositiveButton("Сохранить") { _, _ -> Store.upsertPassword(a, origin, username, password) }
            .setNegativeButton("Никогда") { _, _ -> Store.neverAsk(a, origin) }
            .setNeutralButton("Не сейчас", null)
            .show()
    }
}
