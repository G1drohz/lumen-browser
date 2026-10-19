package dev.g1drohz.lumen

import android.app.AlertDialog
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream

/**
 * Lumen для Android: вкладки на системном WebView (Chromium).
 * Интерфейс как в Safari на iPhone: адресная строка-«таблетка» и панель кнопок внизу.
 */
class MainActivity : AppCompatActivity() {

    private class Tab(val web: WebView) {
        var title = "Новая вкладка"
    }

    private val tabs = mutableListOf<Tab>()
    private var cur = 0
    private lateinit var holder: FrameLayout
    private lateinit var progress: ProgressBar
    private lateinit var urlBox: EditText
    private lateinit var tabBtn: TextView
    private lateinit var prefs: SharedPreferences
    private var adblock = true
    private var darkPages = false
    private var night = false
    private val accent = Color.parseColor("#7C5CFF")

    private val bg get() = if (night) 0xFF1C1C20.toInt() else 0xFFF5F5F7.toInt()
    private val pill get() = if (night) 0xFF34343B.toInt() else 0xFFFFFFFF.toInt()
    private val fg get() = if (night) 0xFFF2F2F5.toInt() else 0xFF1D1D1F.toInt()
    private val mute get() = if (night) 0xFF9A9AA5.toInt() else 0xFF6E6E73.toInt()

    private val startHtml by lazy { assets.open("start.html").bufferedReader().use { it.readText() } }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun web() = tabs[cur].web
    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        prefs = getSharedPreferences("lumen", Context.MODE_PRIVATE)
        adblock = prefs.getBoolean("adblock", true)
        darkPages = prefs.getBoolean("dark", false)
        Adblock.load(this)

        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.GONE
            progressTintList = android.content.res.ColorStateList.valueOf(accent)
        }
        holder = FrameLayout(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            fitsSystemWindows = true
            setBackgroundColor(bg)
            addView(progress, LinearLayout.LayoutParams(-1, dp(3)))
            addView(holder, LinearLayout.LayoutParams(-1, 0, 1f))
            addView(buildBar(), LinearLayout.LayoutParams(-1, -2))
        }
        setContentView(root)
        @Suppress("DEPRECATION")
        window.statusBarColor = bg
        @Suppress("DEPRECATION")
        window.navigationBarColor = bg

        newTab(intent?.dataString ?: HOME)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    web().canGoBack() -> web().goBack()
                    tabs.size > 1 -> closeTab(cur)
                    else -> finish()
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.dataString?.let { newTab(it) }
    }

    override fun onDestroy() {
        tabs.forEach { it.web.destroy() }
        super.onDestroy()
    }

    // ---------- интерфейс ----------
    private fun buildBar(): View {
        fun icon(t: String, onClick: (View) -> Unit) = TextView(this).apply {
            text = t
            textSize = 22f
            setTextColor(fg)
            gravity = Gravity.CENTER
            minHeight = dp(44)
            setOnClickListener { v -> onClick(v) }
        }

        urlBox = EditText(this).apply {
            setSingleLine()
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            hint = "Поиск или адрес сайта"
            textSize = 15f
            setTextColor(fg)
            setHintTextColor(mute)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = dp(14).toFloat()
                setColor(pill)
            }
            setPadding(dp(14), dp(10), dp(14), dp(10))
            setOnFocusChangeListener { _, focused ->
                if (focused) {
                    setText(currentUrl())
                    gravity = Gravity.START or Gravity.CENTER_VERTICAL
                    post { selectAll() }
                } else {
                    gravity = Gravity.CENTER
                    showUrl(tabs.getOrNull(cur)?.web?.url)
                }
            }
            setOnEditorActionListener { _, action, _ ->
                if (action == EditorInfo.IME_ACTION_GO) {
                    go(text.toString())
                    true
                } else false
            }
        }

        tabBtn = icon("⧉ 1") { _ -> showTabs() }.apply { textSize = 16f }

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            listOf(
                icon("‹") { _ -> if (web().canGoBack()) web().goBack() },
                icon("›") { _ -> if (web().canGoForward()) web().goForward() },
                icon("☆") { _ -> toggleBookmark() },
                tabBtn,
                icon("⋯") { anchor -> showMenu(anchor) },
            ).forEach { addView(it, LinearLayout.LayoutParams(0, -2, 1f)) }
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(bg)
            setPadding(dp(10), dp(6), dp(10), dp(2))
            addView(urlBox, LinearLayout.LayoutParams(-1, -2))
            addView(row, LinearLayout.LayoutParams(-1, -2))
        }
    }

    private fun showUrl(url: String?) {
        if (urlBox.hasFocus()) return
        val text = if (url == null || isStart(url)) "" else (Uri.parse(url).host ?: url).removePrefix("www.")
        urlBox.setText(text)
    }

    private fun isStart(u: String) = u.startsWith(START_BASE) || u == "about:blank"

    private fun currentUrl(): String {
        val u = tabs.getOrNull(cur)?.web?.url ?: return ""
        return if (isStart(u)) "" else u
    }

    private fun toUrl(input: String): String {
        val s = input.trim()
        if (s.isEmpty()) return HOME
        if (Regex("https?://.*", RegexOption.IGNORE_CASE).matches(s)) return s
        if (Regex("(localhost|[\\w-]+(\\.[\\w-]+)+)(:\\d+)?([/?#].*)?", RegexOption.IGNORE_CASE).matches(s)) return "https://$s"
        return "https://duckduckgo.com/?q=" + Uri.encode(s)
    }

    private fun go(input: String) {
        load(tabs[cur], toUrl(input))
        urlBox.clearFocus()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
            .hideSoftInputFromWindow(urlBox.windowToken, 0)
    }

    private fun load(tab: Tab, url: String) {
        if (url == HOME) tab.web.loadDataWithBaseURL(START_BASE, startHtml, "text/html", "utf-8", null)
        else tab.web.loadUrl(url)
    }

    // ---------- вкладки ----------
    private fun newTab(url: String?): Tab {
        val w = WebView(this)
        val tab = Tab(w)
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(true)
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
        }

        w.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                if (adblock && !request.isForMainFrame && Adblock.isBlocked(request.url.host)) {
                    return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
                }
                return null
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val scheme = request.url.scheme
                if (scheme == "http" || scheme == "https" || scheme == "about") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) {}
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                if (view === web()) {
                    showUrl(url)
                    progress.visibility = View.VISIBLE
                }
            }

            override fun onPageFinished(view: WebView, url: String?) {
                view.evaluateJavascript(if (darkPages) DARK_JS else LIGHT_JS, null)
                if (view === web()) progress.visibility = View.GONE
            }
        }

        w.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                if (view === web()) {
                    progress.progress = newProgress
                    progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
                }
            }

            override fun onReceivedTitle(view: WebView, title: String?) {
                tab.title = title ?: view.url ?: ""
            }

            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                if (!isUserGesture) return false
                val child = newTab(null)
                (resultMsg.obj as WebView.WebViewTransport).webView = child.web
                resultMsg.sendToTarget()
                return true
            }
        }

        w.setDownloadListener { dlUrl, userAgent, contentDisposition, mime, _ ->
            val req = DownloadManager.Request(Uri.parse(dlUrl))
                .setMimeType(mime)
                .addRequestHeader("User-Agent", userAgent)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(dlUrl, contentDisposition, mime))
            CookieManager.getInstance().getCookie(dlUrl)?.let { req.addRequestHeader("Cookie", it) }
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            toast("Загрузка началась")
        }

        tabs.add(tab)
        select(tabs.size - 1)
        if (url != null) load(tab, url)
        return tab
    }

    private fun select(i: Int) {
        cur = i
        holder.removeAllViews()
        holder.addView(tabs[i].web, FrameLayout.LayoutParams(-1, -1))
        progress.visibility = View.GONE
        tabBtn.text = "⧉ ${tabs.size}"
        showUrl(tabs[i].web.url)
    }

    private fun closeTab(i: Int) {
        val t = tabs.removeAt(i)
        holder.removeAllViews()
        t.web.destroy()
        if (tabs.isEmpty()) {
            newTab(HOME)
            return
        }
        select(minOf(i, tabs.size - 1))
    }

    private fun showTabs() {
        val titles = tabs.mapIndexed { i, t -> (if (i == cur) "● " else "○ ") + t.title }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Вкладки (${tabs.size})")
            .setItems(titles) { _, i -> select(i) }
            .setPositiveButton("+ Новая") { _, _ -> newTab(HOME) }
            .setNegativeButton("Закрыть текущую") { _, _ -> closeTab(cur) }
            .setNeutralButton("Отмена", null)
            .show()
    }

    // ---------- меню, закладки ----------
    private fun showMenu(anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 1, 0, "Новая вкладка")
            menu.add(0, 2, 0, "Обновить")
            menu.add(0, 3, 0, "Закладки")
            menu.add(0, 4, 0, "Закрыть вкладку")
            menu.add(0, 5, 0, "Блокировщик рекламы").apply { isCheckable = true; isChecked = adblock }
            menu.add(0, 6, 0, "Тёмный режим для сайтов").apply { isCheckable = true; isChecked = darkPages }
            menu.add(0, 7, 0, "Поделиться")
            menu.add(0, 8, 0, "Очистить данные")
            setOnMenuItemClickListener { m ->
                when (m.itemId) {
                    1 -> newTab(HOME)
                    2 -> web().reload()
                    3 -> showBookmarks()
                    4 -> closeTab(cur)
                    5 -> {
                        adblock = !adblock
                        prefs.edit().putBoolean("adblock", adblock).apply()
                        web().reload()
                    }
                    6 -> {
                        darkPages = !darkPages
                        prefs.edit().putBoolean("dark", darkPages).apply()
                        tabs.forEach { t -> t.web.evaluateJavascript(if (darkPages) DARK_JS else LIGHT_JS, null) }
                    }
                    7 -> share()
                    8 -> clearData()
                }
                true
            }
            show()
        }
    }

    private fun share() {
        val u = currentUrl()
        if (u.isEmpty()) return
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, u)
        startActivity(Intent.createChooser(send, null))
    }

    private fun clearData() {
        CookieManager.getInstance().removeAllCookies(null)
        WebStorage.getInstance().deleteAllData()
        tabs.forEach { t ->
            t.web.clearCache(true)
            t.web.clearHistory()
        }
        toast("Данные очищены")
    }

    private fun bookmarks(): JSONArray =
        try { JSONArray(prefs.getString("bookmarks", "[]")) } catch (_: Exception) { JSONArray() }

    private fun toggleBookmark() {
        val u = currentUrl()
        if (u.isEmpty()) return
        val arr = bookmarks()
        val out = JSONArray()
        var found = false
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            if (o.getString("u") == u) found = true else out.put(o)
        }
        if (!found) out.put(JSONObject().put("t", tabs[cur].title).put("u", u))
        prefs.edit().putString("bookmarks", out.toString()).apply()
        toast(if (found) "Удалено из закладок" else "Добавлено в закладки")
    }

    private fun showBookmarks() {
        val arr = bookmarks()
        if (arr.length() == 0) {
            toast("Закладок пока нет")
            return
        }
        val titles = Array(arr.length()) { i ->
            val o = arr.getJSONObject(i)
            o.getString("t").ifBlank { o.getString("u") }
        }
        AlertDialog.Builder(this)
            .setTitle("Закладки")
            .setItems(titles) { _, i -> load(tabs[cur], arr.getJSONObject(i).getString("u")) }
            .show()
    }

    companion object {
        const val HOME = "lumen:start"
        const val START_BASE = "https://lumen.start/"
        const val DARK_JS = "(function(){var s=document.getElementById('lumen-dark');if(s)return;s=document.createElement('style');s.id='lumen-dark';s.textContent='html{filter:invert(1) hue-rotate(180deg)!important;background:#fff}img,video,picture,canvas{filter:invert(1) hue-rotate(180deg)!important}';(document.head||document.documentElement).appendChild(s)})()"
        const val LIGHT_JS = "(function(){var s=document.getElementById('lumen-dark');if(s)s.remove()})()"
    }
}
