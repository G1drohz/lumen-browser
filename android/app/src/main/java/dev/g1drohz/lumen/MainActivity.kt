package dev.g1drohz.lumen

import android.Manifest
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Bitmap
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
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
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
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream

/**
 * Lumen для Android: вкладки на системном WebView (Chromium).
 * Интерфейс как в Safari на iPhone: адресная строка-«таблетка» и панель кнопок внизу.
 * Страницы открываются в мобильном виде; режим «Версия для ПК» включается отдельно для вкладки.
 */
class MainActivity : AppCompatActivity() {

    private class Tab(val web: WebView) {
        var title = "Новая вкладка"
        var logical = HOME
        var desktop = false
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
    private val palette get() = Store.palette(this)
    private val bg get() = palette.bg
    private val pill get() = palette.pill
    private val fg get() = palette.fg
    private val mute get() = palette.mute
    private val accent get() = palette.accent

    // --- состояние полноэкранного видео, выбора файла и запросов разрешений ---
    private var customView: View? = null
    private var customCb: WebChromeClient.CustomViewCallback? = null
    private var fileCb: ValueCallback<Array<Uri>>? = null
    private var permCb: ((Map<String, Boolean>) -> Unit)? = null

    private val wallpaperPicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@registerForActivityResult
        toast(if (Store.saveWallpaper(this, uri)) "Обои обновлены" else "Нужна картинка до 2.5 МБ")
        reloadStartPages()
    }

    private val fileLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val uris: Array<Uri>? = if (res.resultCode == RESULT_OK && res.data != null) {
            WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data)
        } else null
        fileCb?.onReceiveValue(uris)
        fileCb = null
    }

    private val permLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        val cb = permCb
        permCb = null
        cb?.invoke(res)
    }

    private val startHtml by lazy {
        try {
            assets.open("start.html").bufferedReader().use { it.readText() }
        } catch (_: Exception) {
            FALLBACK_START
        }
    }

    // User-Agent: настоящий Chrome Mobile (без метки "wv" и "Version/4.0", по которым сайты узнают встроенный WebView)
    private val baseUa: String by lazy { WebSettings.getDefaultUserAgent(this) }
    private val mobileUa: String by lazy {
        val v = Regex("Chrome/([\d.]+)").find(baseUa)?.groupValues?.get(1) ?: "131.0.0.0"
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$v Mobile Safari/537.36"
    }
    private val desktopUa: String by lazy {
        val v = Regex("Chrome/([\\d.]+)").find(baseUa)?.groupValues?.get(1) ?: "120.0.0.0"
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$v Safari/537.36"
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    internal fun web() = tabs[cur].web
    internal fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()

    override fun onCreate(savedInstanceState: Bundle?) {
        // Ночной режим применяем ДО super, иначе после смены темы остаётся серый экран
        val desiredNight = Store.nightMode(this)
        if (AppCompatDelegate.getDefaultNightMode() != desiredNight) {
            AppCompatDelegate.setDefaultNightMode(desiredNight)
        }
        super.onCreate(savedInstanceState)
        night = Store.palette(this).mode == "dark"
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
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }

        try {
            val pending = restoreUrls
            val pendingIndex = restoreIndex
            restoreUrls = null
            when {
                pending != null && pending.isNotEmpty() -> {
                    pending.forEach { newTab(it) }
                    select(pendingIndex.coerceIn(0, tabs.lastIndex))
                }
                savedInstanceState == null && !intent?.dataString.isNullOrEmpty() -> newTab(intent.dataString)
                else -> newTab(Store.launchTarget(this))
            }
        } catch (e: Exception) {
            if (tabs.isEmpty()) newTab(HOME)
            toast("Ошибка загрузки: " + (e.message ?: "unknown"))
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    customView != null -> exitCustomView()
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

    override fun onPause() {
        CookieManager.getInstance().flush()
        if (customView == null) tabs.getOrNull(cur)?.web?.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        tabs.getOrNull(cur)?.web?.onResume()
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

    private fun toUrl(input: String) = Store.toUrl(input)

    private fun go(input: String) {
        load(tabs[cur], toUrl(input))
        urlBox.clearFocus()
        web().requestFocus()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
            .hideSoftInputFromWindow(urlBox.windowToken, 0)
    }

    private fun load(tab: Tab, url: String) {
        tab.logical = url
        when (url) {
            HOME, HOME_BM -> tab.web.loadDataWithBaseURL(
                START_BASE,
                Store.decorateStart(this, startHtml, url == HOME_BM),
                "text/html",
                "utf-8",
                null
            )
            else -> tab.web.loadUrl(url)
        }
    }

    // ---------- режим просмотра: телефон / ПК ----------
    private fun applyMode(tab: Tab) {
        val s = tab.web.settings
        s.userAgentString = if (tab.desktop) desktopUa else mobileUa
        // Мобильный режим: ширина вёрстки = ширине экрана. ПК-режим: широкая вёрстка, уменьшенная под экран.
        s.useWideViewPort = true
        s.loadWithOverviewMode = tab.desktop
    }

    // Размер текста = «размер шрифта» × «масштаб страницы». Раньше здесь вызывался setInitialScale(),
    // из-за чего вёрстка получалась шириной в физические пиксели экрана, то есть как на ПК.
    private fun textZoomValue(): Int {
        val font = Store.int(this, "fontScale", 100).coerceIn(80, 160)
        val zoom = Store.int(this, "pageZoom", 100).coerceIn(50, 200)
        return (font * zoom / 100).coerceIn(50, 300)
    }

    // ---------- вкладки ----------
    private fun newTab(url: String?): Tab {
        val w = WebView(this)
        val tab = Tab(w)
        w.setBackgroundColor(bg)
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true)
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(true)
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            offscreenPreRaster = true
            textZoom = textZoomValue()
        }
        applyMode(tab)

        w.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val h = request.url.host
                if (adblock && !request.isForMainFrame && h != null && !h.endsWith("googlevideo.com") && !h.endsWith("ytimg.com") && !h.endsWith("ggpht.com") && Adblock.isBlocked(h)) {
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
                if (url != null && !isStart(url) && url != "about:blank") tab.logical = url
                if (view === web()) {
                    showUrl(url)
                    progress.visibility = View.VISIBLE
                }
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (!tab.desktop) {
                    view.evaluateJavascript("(function(){var m=document.querySelector('meta[name=viewport]');if(!m){m=document.createElement('meta');m.name='viewport';(document.head||document.documentElement).appendChild(m)}m.content='width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes';})();", null)
                }
                view.evaluateJavascript(if (darkPages) DARK_JS else LIGHT_JS, null)
                if (url != null && (url.startsWith("http://") || url.startsWith("https://")) && !isStart(url)) {
                    view.evaluateJavascript(Store.PW_HOOK, null)
                    addHistory(view.title ?: url, url)
                }
                if (view === web()) progress.visibility = View.GONE
            }
            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                val idx = tabs.indexOfFirst { it.web === view }
                val logical = if (idx >= 0) tabs[idx].logical else HOME
                val wasDesktop = if (idx >= 0) tabs[idx].desktop else false
                try { view.destroy() } catch (_: Exception) {}
                if (idx >= 0) { tabs.removeAt(idx); holder.removeAllViews() }
                val t = newTab(logical)
                t.desktop = wasDesktop
                applyMode(t)
                toast("Страница перезагружена после сбоя")
                return true
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

            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                val message = consoleMessage.message() ?: return false
                if (!message.startsWith("LUMEN_PW_SAVE ")) return false
                // адрес сайта берём у самого WebView: сообщение из консоли может написать любая страница
                offerFromPage(message.removePrefix("LUMEN_PW_SAVE "), w.url)
                return true
            }

            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                if (!isUserGesture) return false
                val child = newTab(null)
                (resultMsg.obj as WebView.WebViewTransport).webView = child.web
                resultMsg.sendToTarget()
                return true
            }

            // <input type="file"> и загрузка фото
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: WebChromeClient.FileChooserParams
            ): Boolean {
                fileCb?.onReceiveValue(null)
                fileCb = callback
                return try {
                    fileLauncher.launch(params.createIntent())
                    true
                } catch (_: Exception) {
                    fileCb = null
                    callback.onReceiveValue(null)
                    false
                }
            }

            // камера и микрофон
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val wantVideo = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    val wantAudio = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    if (!wantVideo && !wantAudio) {
                        request.deny()
                        return@runOnUiThread
                    }
                    val what = when {
                        wantVideo && wantAudio -> "использовать камеру и микрофон"
                        wantVideo -> "использовать камеру"
                        else -> "использовать микрофон"
                    }
                    askSite(request.origin.host ?: "", what) { allow ->
                        if (!allow) {
                            request.deny()
                            return@askSite
                        }
                        val need = ArrayList<String>()
                        if (wantVideo) need.add(Manifest.permission.CAMERA)
                        if (wantAudio) need.add(Manifest.permission.RECORD_AUDIO)
                        withPermissions(need.toTypedArray()) { res ->
                            val ok = ArrayList<String>()
                            if (wantVideo && res[Manifest.permission.CAMERA] == true) ok.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                            if (wantAudio && res[Manifest.permission.RECORD_AUDIO] == true) ok.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                            if (ok.isEmpty()) request.deny() else request.grant(ok.toTypedArray())
                        }
                    }
                }
            }

            // геолокация
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                askSite(Uri.parse(origin).host ?: origin, "узнать ваше местоположение") { allow ->
                    if (!allow) {
                        callback.invoke(origin, false, false)
                        return@askSite
                    }
                    withPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) { res ->
                        callback.invoke(origin, res.values.any { it }, false)
                    }
                }
            }

            // видео на весь экран
            override fun onShowCustomView(view: View, callback: WebChromeClient.CustomViewCallback) {
                if (customView != null) {
                    callback.onCustomViewHidden()
                    return
                }
                customView = view
                customCb = callback
                window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                (window.decorView as FrameLayout).addView(view, FrameLayout.LayoutParams(-1, -1))
                WindowCompat.getInsetsController(window, window.decorView).hide(WindowInsetsCompat.Type.systemBars())
            }

            override fun onHideCustomView() {
                exitCustomView()
            }
        }

        w.setDownloadListener { dlUrl, userAgent, contentDisposition, mime, _ ->
            startDownload(dlUrl, userAgent, contentDisposition, mime)
        }

        // долгое нажатие на ссылку или картинку
        w.setOnLongClickListener { v -> handleLongPress(v as WebView) }

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

    // ---------- полноэкранное видео ----------
    private fun exitCustomView() {
        val v = customView ?: return
        (window.decorView as FrameLayout).removeView(v)
        customView = null
        customCb?.onCustomViewHidden()
        customCb = null
        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.getInsetsController(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
    }

    // ---------- разрешения сайтов ----------
    private fun askSite(host: String, what: String, cb: (Boolean) -> Unit) {
        var answered = false
        fun answer(v: Boolean) {
            if (!answered) {
                answered = true
                cb(v)
            }
        }
        AlertDialog.Builder(this)
            .setTitle(host.ifEmpty { "Сайт" })
            .setMessage("Хочет $what")
            .setPositiveButton("Разрешить") { _, _ -> answer(true) }
            .setNegativeButton("Запретить") { _, _ -> answer(false) }
            .setOnCancelListener { answer(false) }
            .show()
    }

    private fun hasPermission(p: String) =
        ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    // Просит у Android недостающие разрешения и возвращает карту «разрешение → выдано»
    private fun withPermissions(perms: Array<String>, cb: (Map<String, Boolean>) -> Unit) {
        val missing = perms.filter { !hasPermission(it) }
        if (missing.isEmpty()) {
            cb(perms.associateWith { true })
            return
        }
        permCb = { res -> cb(perms.associateWith { p -> res[p] == true || hasPermission(p) }) }
        permLauncher.launch(missing.toTypedArray())
    }

    // ---------- загрузки, долгое нажатие ----------
    private fun startDownload(url: String, userAgent: String?, contentDisposition: String?, mime: String?) {
        // DownloadManager умеет только http(s); blob:/data: раньше приводили к падению приложения
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            toast("Этот файл нельзя скачать напрямую")
            return
        }
        try {
            val name = URLUtil.guessFileName(url, contentDisposition, mime)
            val req = DownloadManager.Request(Uri.parse(url))
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            if (!mime.isNullOrEmpty()) req.setMimeType(mime)
            if (!userAgent.isNullOrEmpty()) req.addRequestHeader("User-Agent", userAgent)
            CookieManager.getInstance().getCookie(url)?.let { req.addRequestHeader("Cookie", it) }
            val id = (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            Store.rememberDownload(this, id, name, url)
            toast("Загрузка началась")
        } catch (e: Exception) {
            toast("Не удалось начать загрузку")
        }
    }

    private fun copyText(label: String, text: String) {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText(label, text))
        toast("Скопировано")
    }

    private fun handleLongPress(w: WebView): Boolean {
        val r = w.hitTestResult
        val extra = r.extra ?: return false
        return when (r.type) {
            WebView.HitTestResult.SRC_ANCHOR_TYPE, WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE -> {
                linkMenu(extra)
                true
            }
            WebView.HitTestResult.IMAGE_TYPE -> {
                imageMenu(extra)
                true
            }
            else -> false
        }
    }

    private fun linkMenu(url: String) {
        AlertDialog.Builder(this)
            .setTitle(url.take(80))
            .setItems(arrayOf("Открыть в новой вкладке", "Копировать ссылку", "Поделиться")) { _, i ->
                when (i) {
                    0 -> newTab(url)
                    1 -> copyText("Ссылка", url)
                    2 -> startActivity(
                        Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url), null)
                    )
                }
            }
            .show()
    }

    private fun imageMenu(url: String) {
        AlertDialog.Builder(this)
            .setTitle("Изображение")
            .setItems(arrayOf("Открыть в новой вкладке", "Скачать", "Копировать адрес")) { _, i ->
                when (i) {
                    0 -> newTab(url)
                    1 -> startDownload(url, web().settings.userAgentString, null, null)
                    2 -> copyText("Адрес изображения", url)
                }
            }
            .show()
    }

    // ---------- меню ----------
    private fun showMenu(anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 1, 0, "Новая вкладка")
            menu.add(0, 2, 0, "Обновить")
            menu.add(0, 3, 0, "Закладки")
            menu.add(0, 16, 0, "История")
            menu.add(0, 4, 0, "Закрыть вкладку")
            menu.add(0, 15, 0, "Версия для ПК").apply { isCheckable = true; isChecked = tabs[cur].desktop }
            menu.add(0, 5, 0, "Блокировщик рекламы").apply { isCheckable = true; isChecked = adblock }
            menu.add(0, 6, 0, "Тёмный режим для сайтов").apply { isCheckable = true; isChecked = darkPages }
            menu.add(0, 7, 0, "Поделиться")
            menu.add(0, 8, 0, "Очистить данные")
            menu.add(0, 9, 0, "Загрузки")
            menu.add(0, 10, 0, "Пароли")
            menu.add(0, 11, 0, "Оформление")
            menu.add(0, 12, 0, "Найти на странице")
            menu.add(0, 13, 0, "Увеличить")
            menu.add(0, 14, 0, "Уменьшить")
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
                    9 -> Panels.downloads(this@MainActivity)
                    10 -> Panels.passwords(this@MainActivity)
                    11 -> Panels.settings(this@MainActivity)
                    12 -> Panels.find(this@MainActivity)
                    13 -> web().zoomBy(1.1f)
                    14 -> web().zoomBy(0.9f)
                    15 -> {
                        val t = tabs[cur]
                        t.desktop = !t.desktop
                        applyMode(t)
                        if (t.logical == HOME || t.logical == HOME_BM) load(t, t.logical) else t.web.reload()
                        toast(if (t.desktop) "Версия для ПК" else "Мобильная версия")
                    }
                    16 -> showHistory()
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
        prefs.edit().remove("history").apply()
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
        val titles = Array(arr.length()) { i -> arr.getJSONObject(i).optString("t").ifBlank { arr.getJSONObject(i).optString("u") } }
        AlertDialog.Builder(this)
            .setTitle("Закладки")
            .setItems(titles) { _, i -> go(arr.getJSONObject(i).getString("u")) }
            .setNegativeButton("Закрыть", null)
            .show()
    }

    // ---------- история ----------
    private fun history(): JSONArray =
        try { JSONArray(prefs.getString("history", "[]")) } catch (_: Exception) { JSONArray() }

    private fun addHistory(title: String, url: String) {
        val arr = history()
        if (arr.length() > 0 && arr.getJSONObject(0).optString("u") == url) return
        val out = JSONArray().put(JSONObject().put("t", title).put("u", url).put("ts", System.currentTimeMillis()))
        for (i in 0 until minOf(arr.length(), 299)) out.put(arr.getJSONObject(i))
        prefs.edit().putString("history", out.toString()).apply()
    }

    private fun showHistory() {
        val arr = history()
        if (arr.length() == 0) {
            toast("История пуста")
            return
        }
        val titles = Array(arr.length()) { i ->
            val o = arr.getJSONObject(i)
            o.optString("t").ifBlank { o.optString("u") }
        }
        AlertDialog.Builder(this)
            .setTitle("История")
            .setItems(titles) { _, i -> go(arr.getJSONObject(i).getString("u")) }
            .setNeutralButton("Очистить") { _, _ ->
                prefs.edit().remove("history").apply()
                toast("История очищена")
            }
            .setNegativeButton("Закрыть", null)
            .show()
    }

    // ---------- вызовы из экранов Panels ----------
    internal fun launchWallpaperPicker() {
        wallpaperPicker.launch("image/*")
    }

    internal fun onSettingsChanged(recreateUi: Boolean) {
        adblock = prefs.getBoolean("adblock", true)
        darkPages = prefs.getBoolean("dark", false)
        if (::holder.isInitialized && tabs.isNotEmpty()) {
            val tz = textZoomValue()
            tabs.forEach { t ->
                t.web.settings.textZoom = tz
                t.web.evaluateJavascript(if (darkPages) DARK_JS else LIGHT_JS, null)
            }
        }
        if (!recreateUi) return
        stashTabs()
        val desired = Store.nightMode(this)
        if (AppCompatDelegate.getDefaultNightMode() != desired) AppCompatDelegate.setDefaultNightMode(desired)
        else recreate()
    }

    internal fun reloadStartPages() {
        tabs.forEach { t ->
            if (t.logical == HOME || t.logical == HOME_BM) load(t, t.logical)
        }
    }

    private fun stashTabs() {
        if (tabs.isEmpty()) return
        restoreUrls = tabs.map { it.logical }
        restoreIndex = cur
    }

    private fun offerFromPage(raw: String, pageUrl: String?) {
        val o = try { JSONObject(raw) } catch (_: Exception) { return }
        val origin = Store.validOrigin(pageUrl ?: "")
        val username = o.optString("username").take(200)
        val password = o.optString("password")
        if (origin.isEmpty() || password.isEmpty() || password.length > 500) return
        if (Store.isNever(this, origin) || Store.samePassword(this, origin, username, password)) return
        val update = Store.passwords(this).let { arr ->
            (0 until arr.length()).any {
                val row = arr.getJSONObject(it)
                row.optString("origin") == origin && row.optString("username") == username
            }
        }
        Panels.offerPassword(this, origin, username, password, update)
    }

    companion object {
        const val HOME = "lumen:start"
        const val HOME_BM = "lumen:bookmarks"
        const val START_BASE = "https://lumen.start/"
        const val DARK_JS = "(function(){var s=document.getElementById('lumen-dark');if(s)return;s=document.createElement('style');s.id='lumen-dark';s.textContent='html{filter:invert(1) hue-rotate(180deg)!important;background:#fff}img,video,picture,canvas{filter:invert(1) hue-rotate(180deg)!important}';(document.head||document.documentElement).appendChild(s)})()"
        const val LIGHT_JS = "(function(){var s=document.getElementById('lumen-dark');if(s)s.remove()})()"
        private const val FALLBACK_START = """<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:16px system-ui;background:#121218;color:#eee}form{width:90%;max-width:420px}input{width:100%;padding:14px 16px;border-radius:12px;border:1px solid #333;background:#1c1c24;color:#eee;font:inherit}</style></head><body><form action="https://duckduckgo.com/" method="get"><input name="q" placeholder="Поиск или адрес" autofocus></form><script>window.applyLumen=function(){}</script></body></html>"""

        private var restoreUrls: List<String>? = null
        private var restoreIndex = 0
    }
}
