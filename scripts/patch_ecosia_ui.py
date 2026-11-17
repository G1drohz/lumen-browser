#!/usr/bin/env python3
from pathlib import Path
import re

p = Path("android/app/src/main/java/dev/g1drohz/lumen/MainActivity.kt")
c = p.read_text()

if "import android.graphics.Color" not in c:
    c = c.replace("import android.graphics.Bitmap", "import android.graphics.Bitmap\nimport android.graphics.Color")

old_root = """        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
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
        }"""

new_root = """        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.GONE
            progressTintList = android.content.res.ColorStateList.valueOf(accent)
            scaleY = 0.6f
        }
        holder = FrameLayout(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            fitsSystemWindows = true
            setBackgroundColor(bg)
            addView(buildBar(), LinearLayout.LayoutParams(-1, -2))
            addView(progress, LinearLayout.LayoutParams(-1, dp(2)))
            addView(holder, LinearLayout.LayoutParams(-1, 0, 1f))
        }"""

if "addView(buildBar()" in c and "addView(progress" in c[c.find("val root"):c.find("val root")+400]:
    chunk = c[c.find("val root"):c.find("val root")+500]
    if chunk.find("buildBar") < chunk.find("holder"):
        print("root already top-chrome")
    elif old_root in c:
        c = c.replace(old_root, new_root, 1)
        print("root moved to top")
    else:
        print("root pattern mismatch — trying loose replace")
else:
    if old_root in c:
        c = c.replace(old_root, new_root, 1)
        print("root moved to top")
    else:
        print("root pattern not found")

start = c.find("    private fun buildBar(): View {")
end = c.find("\n    private fun showUrl", start)
if start < 0 or end < 0:
    raise SystemExit("buildBar markers missing")

if "pillBg" not in c[start:end]:
    new_bar = __import__("base64").b64decode("ICAgIHByaXZhdGUgZnVuIGJ1aWxkQmFyKCk6IFZpZXcgewogICAgICAgIGZ1biBwaWxsQmcocmFkaXVzOiBGbG9hdCA9IGRwKDIyKS50b0Zsb2F0KCksIGZpbGw6IEludCA9IHBpbGwpID0gR3JhZGllbnREcmF3YWJsZSgpLmFwcGx5IHsKICAgICAgICAgICAgc2hhcGUgPSBHcmFkaWVudERyYXdhYmxlLlJFQ1RBTkdMRQogICAgICAgICAgICBjb3JuZXJSYWRpdXMgPSByYWRpdXMKICAgICAgICAgICAgc2V0Q29sb3IoZmlsbCkKICAgICAgICB9CiAgICAgICAgZnVuIGljb25CdG4odDogU3RyaW5nLCBvbkNsaWNrOiAoVmlldykgLT4gVW5pdCkgPSBUZXh0Vmlldyh0aGlzKS5hcHBseSB7CiAgICAgICAgICAgIHRleHQgPSB0CiAgICAgICAgICAgIHRleHRTaXplID0gMjBmCiAgICAgICAgICAgIHNldFRleHRDb2xvcihmZykKICAgICAgICAgICAgZ3Jhdml0eSA9IEdyYXZpdHkuQ0VOVEVSCiAgICAgICAgICAgIG1pbldpZHRoID0gZHAoNDIpCiAgICAgICAgICAgIG1pbkhlaWdodCA9IGRwKDQyKQogICAgICAgICAgICBiYWNrZ3JvdW5kID0gcGlsbEJnKGRwKDE0KS50b0Zsb2F0KCkKICAgICAgICAgICAgc2V0UGFkZGluZyhkcCg2KSwgZHAoNiksIGRwKDYpLCBkcCg2KSkKICAgICAgICAgICAgc2V0T25DbGlja0xpc3RlbmVyIHsgdiAtPgogICAgICAgICAgICAgICAgdi5hbmltYXRlKCkuc2NhbGVYKDEuMDgpLnNjYWxlWSgxLjA4KS5zZXREdXJhdGlvbigxMDApLndpdGhFbmRBY3Rpb24gewogICAgICAgICAgICAgICAgICAgIHYuYW5pbWF0ZSgpLnNjYWxlWCgxZikuc2NhbGVZKDFmKS5zZXREdXJhdGlvbigxMDApLnN0YXJ0KCkKICAgICAgICAgICAgICAgIH0uc3RhcnQoKQogICAgICAgICAgICAgICAgb25DbGljayh2KQogICAgICAgICAgICB9CiAgICAgICAgfQogICAgICAgIHVybEJveCA9IEVkaXRUZXh0KHRoaXMpLmFwcGx5IHsKICAgICAgICAgICAgc2V0U2luZ2xlTGluZSgpCiAgICAgICAgICAgIGlucHV0VHlwZSA9IElucHV0VHlwZS5UWVBFX0NMQVNTX1RFWFQgb3IgSW5wdXRUeXBlLlRZUEVfVEVYVF9WQVJJQVRJT05fVVJJCiAgICAgICAgICAgIGltZU9wdGlvbnMgPSBFZGl0b3JJbmZvLklNRV9BQ1RJT05fR08KICAgICAgICAgICAgaGludCA9ICLQn9C+0LjRgdC6INC40LvQuCDQsNC00YDQtdGBINGB0LDQudGC0LAiCiAgICAgICAgICAgIHRleHRTaXplID0gMTVmCiAgICAgICAgICAgIHNldFRleHRDb2xvcihmZykKICAgICAgICAgICAgc2V0SGludFRleHRDb2xvcihtdXRlKQogICAgICAgICAgICBncmF2aXR5ID0gR3Jhdml0eS5DRU5URVIKICAgICAgICAgICAgYmFja2dyb3VuZCA9IHBpbGxCZygpCiAgICAgICAgICAgIHNldFBhZGRpbmcoZHAoMTQpLCBkcCgxMCksIGRwKDE0KSwgZHAoMTApKQogICAgICAgICAgICBzZXRPbkZvY3VzQ2hhbmdlTGlzdGVuZXIgeyBfLCBmb2N1c2VkIC0+CiAgICAgICAgICAgICAgICBpZiAoZm9jdXNlZCkgewogICAgICAgICAgICAgICAgICAgIHNldFRleHQoY3VycmVudFVybCgpKQogICAgICAgICAgICAgICAgICAgIGdyYXZpdHkgPSBHcmF2aXR5LlNUQVJUIG9yIEdyYXZpdHkuQ0VOVEVSX1ZFUlRJQ0FMCiAgICAgICAgICAgICAgICAgICAgcG9zdCB7IHNlbGVjdEFsbCgpIH0KICAgICAgICAgICAgICAgIH0gZWxzZSB7CiAgICAgICAgICAgICAgICAgICAgZ3Jhdml0eSA9IEdyYXZpdHkuQ0VOVEVSCiAgICAgICAgICAgICAgICAgICAgc2hvd1VybCh0YWJzLmdldE9yTnVsbChjdXIpPy53ZWIudXJsKQogICAgICAgICAgICAgICAgfQogICAgICAgICAgICB9CiAgICAgICAgICAgIHNldE9uRWRpdG9yQWN0aW9uTGlzdGVuZXIgeyBfLCBhY3Rpb24sIF8gLT4KICAgICAgICAgICAgICAgIGlmIChhY3Rpb24gPT0gRWRpdG9ySW5mby5JTUVfQUNUSU9OX0dPKSB7CiAgICAgICAgICAgICAgICAgICAgZ28odGV4dC50b1N0cmluZygpKQogICAgICAgICAgICAgICAgICAgIHRydWUKICAgICAgICAgICAgICAgIH0gZWxzZSBmYWxzZQogICAgICAgICAgICB9CiAgICAgICAgfQogICAgICAgIHRhYkJ0biA9IGljb25CdG4oIuKKoiAxIikgeyBfIC0+IHNob3dUYWJzKCkgfS5hcHBseSB7IHRleHRTaXplID0gMTZmIH0KICAgICAgICB2YWwgYnJhbmQgPSBUZXh0Vmlldyh0aGlzKS5hcHBseSB7CiAgICAgICAgICAgIHRleHQgPSAiTFVNRU4iCiAgICAgICAgICAgIHRleHRTaXplID0gMThmCiAgICAgICAgICAgIHNldFR5cGVmYWNlKHRydWUpCiAgICAgICAgICAgIHNldFRleHRDb2xvcihmZykKICAgICAgICAgICAgZ3Jhdml0eSA9IEdyYXZpdHkuQ0VOVEVSCiAgICAgICAgfQogICAgICAgIHZhbCB0b3BSb3cgPSBMaW5lYXJMYXlvdXQodGhpcykuYXBwbHkgewogICAgICAgICAgICBvcmllbnRhdGlvbiA9IExpbmVhckxheW91dC5IT1JJWk9OVEFMCiAgICAgICAgICAgIGdyYXZpdHkgPSBHcmF2aXR5LkNFTlRFUl9WRVJUSUNBTAogICAgICAgICAgICBzZXRQYWRkaW5nKGRwKDQpLCAwLCBkcCg0KSwgMCkKICAgICAgICAgICAgYWRkVmlldyhicmFuZCwgTGluZWFyTGF5b3V0LkxheW91dFBhcmFtcygwLCAtMiwgMWYpKQogICAgICAgICAgICBhZGRWaWV3KHRhYkJ0biwgTGluZWFyTGF5b3V0LkxheW91dFBhcmFtcygtMiwgLTIpKQogICAgICAgIH0KICAgICAgICB2YWwgbmF2ID0gTGluZWFyTGF5b3V0KHRoaXMpLmFwcGx5IHsKICAgICAgICAgICAgb3JpZW50YXRpb24gPSBMaW5lYXJMYXlvdXQuSE9SSVpPTlRBTAogICAgICAgICAgICBsaXN0T2YoCiAgICAgICAgICAgICAgICBpY29uQnRuKCLil6IpIHsgXyAtPiBpZiAod2ViKCkuY2FuR29CYWNrKCkpIHdlYigpLmdvQmFjaygpIH0sCiAgICAgICAgICAgICAgICBpY29uQnRuKCLil6MpIHsgXyAtPiBpZiAod2ViKCkuY2FuR29Gb3J3YXJkKCkpIHdlYigpLmdvRm9yd2FyZCgpIH0sCiAgICAgICAgICAgICAgICBpY29uQnRuKCLilrMpIHsgXyAtPiB3ZWIoKS5yZWxvYWQoKSB9LAogICAgICAgICAgICAgICAgaWNvbkJ0bigi4piGIikgeyBfIC0+IHRvZ2dsZUJvb2ttYXJrKCkgfSwKICAgICAgICAgICAgICAgIGljb25CdG4oIuKMgiIpIHsgXyAtPiBsb2FkKHRhYnNbY3VyXSwgSE9NRSkgfSwKICAgICAgICAgICAgKS5mb3JFYWNoIHsgYWRkVmlldyhpdCwgTGluZWFyTGF5b3V0LkxheW91dFBhcmFtcygwLCAtMiwgMWYpKSB9CiAgICAgICAgfQoKICAgICAgICByZXR1cm4gTGluZWFyTGF5b3V0KHRoaXMpLmFwcGx5IHsKICAgICAgICAgICAgb3JpZW50YXRpb24gPSBMaW5lYXJMYXlvdXQuVkVSVElDQUwKICAgICAgICAgICAgc2V0QmFja2dyb3VuZENvbG9yKGJnKQogICAgICAgICAgICBzZXRQYWRkaW5nKGRwKDEyKSwgZHAoOCksIGRwKDEyKSwgZHAoOCkpCiAgICAgICAgICAgIGVsZXZhdGlvbiA9IGRwKDQpLnRvRmxvYXQoKQogICAgICAgICAgICBhZGRWaWV3KHRvcFJvdywgTGluZWFyTGF5b3V0LkxheW91dFBhcmFtcygtMSwgLTIpKQogICAgICAgICAgICBhZGRWaWV3KHVybEJveCwgTGluZWFyTGF5b3V0LkxheW91dFBhcmFtcygtMSwgLTIpLmFsc28geyBpdC50b3BNYXJnaW4gPSBkcCg4KSB9KQogICAgICAgICAgICBhZGRWaWV3KG5hdiwgTGluZWFyTGF5b3V0LkxheW91dFBhcmFtcygtMSwgLTIpLmFsc28geyBpdC50b3BNYXJnaW4gPSBkcCg0KSB9KQogICAgICAgIH0KICAgIH0K").decode()
    c = c[:start] + new_bar + c[end:]
    print("buildBar replaced")
else:
    print("buildBar already new")

old_prog = "                    progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE"
new_prog = """                    if (newProgress in 1..99) {
                        if (progress.visibility != View.VISIBLE) {
                            progress.alpha = 0f
                            progress.visibility = View.VISIBLE
                            progress.animate().alpha(1f).setDuration(160).start()
                        }
                    } else if (progress.visibility == View.VISIBLE) {
                        progress.animate().alpha(0f).setDuration(200).withEndAction {
                            progress.visibility = View.GONE
                            progress.alpha = 1f
                        }.start()
                    }"""
if old_prog in c:
    c = c.replace(old_prog, new_prog, 1)
    print("progress anim")

g = Path("android/app/build.gradle.kts")
if g.exists():
    t = g.read_text()
    t = re.sub(r"versionCode = \\d+", "versionCode = 33", t)
    t = re.sub(r"versionCode = \d+", "versionCode = 33", t)
    t = re.sub(r'versionName = "[^"]+"', 'versionName = "3.3.0"', t)
    g.write_text(t)

p.write_text(c)
print("done", c.count("{"), c.count("}"))
