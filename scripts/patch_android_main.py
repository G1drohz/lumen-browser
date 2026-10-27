#!/usr/bin/env python3
from pathlib import Path
p = Path('android/app/src/main/java/dev/g1drohz/lumen/MainActivity.kt')
c = p.read_text()
start = c.find('private val mobileUa')
end = c.find('private val desktopUa')
assert start > 0 and end > start
new = '''private val mobileUa: String by lazy {
        val v = Regex("Chrome/([0-9.]+)").find(baseUa)?.groupValues?.get(1) ?: "131.0.0.0"
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$v Mobile Safari/537.36"
    }
    '''
c = c[:start] + new + c[end:]
# also fix desktopUa if it still has \\d
c = c.replace('Regex("Chrome/([\\d.]+)")', 'Regex("Chrome/([0-9.]+)")')
c = c.replace('Regex("Chrome/([\d.]+)")', 'Regex("Chrome/([0-9.]+)")')
c = c.replace(
    's.useWideViewPort = tab.desktop\n        s.loadWithOverviewMode = tab.desktop',
    's.useWideViewPort = true\n        s.loadWithOverviewMode = tab.desktop', 1)
c = c.replace(
    '''    override fun onPause() {
        CookieManager.getInstance().flush()
        tabs.getOrNull(cur)?.web?.onPause()
        super.onPause()
    }''',
    '''    override fun onPause() {
        CookieManager.getInstance().flush()
        if (customView == null) tabs.getOrNull(cur)?.web?.onPause()
        super.onPause()
    }''', 1)
c = c.replace(
    'customView = view\n                customCb = callback\n                (window.decorView as FrameLayout).addView(view, FrameLayout.LayoutParams(-1, -1))',
    'customView = view\n                customCb = callback\n                window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)\n                (window.decorView as FrameLayout).addView(view, FrameLayout.LayoutParams(-1, -1))', 1)
c = c.replace(
    'customCb = null\n        WindowCompat.getInsetsController(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())',
    'customCb = null\n        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)\n        WindowCompat.getInsetsController(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())', 1)
c = c.replace(
    'if (adblock && !request.isForMainFrame && Adblock.isBlocked(request.url.host))',
    'val h = request.url.host\n                if (adblock && !request.isForMainFrame && h != null && !h.endsWith("googlevideo.com") && !h.endsWith("ytimg.com") && !h.endsWith("ggpht.com") && Adblock.isBlocked(h))', 1)
if 'onRenderProcessGone' not in c:
    needle = '''            override fun onPageFinished(view: WebView, url: String?) {
                view.evaluateJavascript(if (darkPages) DARK_JS else LIGHT_JS, null)
                if (url != null && (url.startsWith("http://") || url.startsWith("https://")) && !isStart(url)) {
                    view.evaluateJavascript(Store.PW_HOOK, null)
                    addHistory(view.title ?: url, url)
                }
                if (view === web()) progress.visibility = View.GONE
            }
        }'''
    insert = '''            override fun onPageFinished(view: WebView, url: String?) {
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
        }'''
    if needle in c:
        c = c.replace(needle, insert, 1)
c = c.replace(
    'mediaPlaybackRequiresUserGesture = false\n            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE\n            textZoom = textZoomValue()',
    'mediaPlaybackRequiresUserGesture = false\n            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE\n            offscreenPreRaster = true\n            textZoom = textZoomValue()', 1)
p.write_text(c)
print('patched', len(c))
g = Path('android/app/build.gradle.kts')
if g.exists():
    t = g.read_text()
    t = t.replace('versionCode = 31', 'versionCode = 32').replace('versionName = "3.1.1"', 'versionName = "3.2.0"')
    t = t.replace('versionCode = 30', 'versionCode = 32').replace('versionName = "3.0.0"', 'versionName = "3.2.0"')
    g.write_text(t)
    print('version ok')
