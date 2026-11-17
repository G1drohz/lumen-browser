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
    import base64
    new_bar = base64.b64decode("ICAgIHByaXZhdGUgZnVuIGJ1aWxkQmFyKCk6IFZpZXcgewogICAgICAgIGZ1biBwaWxsQmcocmFkaXVzOiBGbG9hdCA9IGRwKDE4KS50b0Zsb2F0KCkgPSBHcmFkaWVudERyYXdhYmxlKCkudG8gQXBwbHkgewogICAgICAgICAgICBjb3JuZXJSYWRpdXMgPSByYWRpdXMKICAgICAgICAgICAgc2V0Q29sb3IocGlsbCkKICAgICAgICB9CiAgICAgICAgZnVuIGljb25CdG4odGV4dDogU3RyaW5nLCBvbkNsaWNrOiAoVmlldykgLT4gVW5pdCkgPSBUZXh0Vmlldyh0aGlzKS5hcHBseSB7CiAgICAgICAgICAgIHRleHQgPSB0ZXh0CiAgICAgICAgICAgIHRleHRTaXplID0gMThmCiAgICAgICAgICAgIHNldFRleHRDb2xvcihmZykKICAgICAgICAgICAgZ3Jhdml0eSA9IEdyYXZpdHkuQ0VOVEVSCiAgICAgICAgICAgIG1pbkhlaWdodCA9IGRwKDQwKQogICAgICAgICAgICBiYWNrZ3JvdW5kID0gcGlsbEJnKGRwKDEyKS50b0Zsb2F0KCkKICAgICAgICAgICAgc2V0UGFkZGluZyhkcCg4KSwgZHAoNiksIGRwKDgpLCBkcCg2KSkKICAgICAgICAgICAgc2V0T25DbGlja0xpc3RlbmVyIHsgdiAtPgogICAgICAgICAgICAgICAgdi5hbmltYXRlKCkuc2NhbGVYKDEuMDVmKS5zY2FsZVkoMS4wNWYpLnNldER1cmF0aW9uKDEwMCkud2l0aEVuZEFjdGlvbiB7CiAgICAgICAgICAgICAgICAgICAgdi5hbmltYXRlKCkuc2NhbGVYKDFmKS5zY2FsZVkoMWYpLnNldER1cmF0aW9uKDEwMCkuc3RhcnQoKQogICAgICAgICAgICAgICAgfS5zdGFydCgpCiAgICAgICAgICAgICAgICBvbkNsaWNrKHYpCiAgICAgICAgICAgIH0KICAgICAgICB9CiAgICAgICAgdXJsQm94ID0gRWRpdFRleHQodGhpcykuYXBwbHkgewogICAgICAgICAgICBzZXRTaW5nbGVMaW5lKCkKICAgICAgICAgICAgaW5wdXRUeXBlID0gSW5wdXRUeXBlLlRZUEVfQ0xBU1NfVEVYVCB8IElucHV0VHlwZS5UWVBFX1RFWFRfVkFSSUFUSU9OX1VSSQogICAgICAgICAgICBpbWVPcHRpb25zID0gRWRpdG9ySW5mby5JTUVfQUNUSU9OX0dPCiAgICAgICAgICAgIGhpbnQgPSAi0J/QvtC40YHQuiDQuNC70Lgg0LDQtNGA0LXRgSDRgdCw0LnRgtCwIgogICAgICAgICAgICB0ZXh0U2l6ZSA9IDE1ZgogICAgICAgICAgICBzZXRUZXh0Q29sb3IoZmcpCiAgICAgICAgICAgIHNldEhpbnRUZXh0Q29sb3IobXV0ZSkKICAgICAgICAgICAgZ3Jhdml0eSA9IEdyYXZpdHkuQ0VOVEVSCiAgICAgICAgICAgIGJhY2tncm91bmQgPSBwaWxsQmcocikKICAgICAgICAgICAgc2V0UGFkZGluZyhkcCgxNCksIGRwKDEwKSwgZHAoMTQpLCBkcCgxMCkpCiAgICAgICAgICAgIHNldE9uRm9jdXNDaGFuZ2VMaXN0ZW5lciB7IF8sIGZvY3VzZWQgLT4KICAgICAgICAgICAgICAgIGlmIChmb2N1c2VkKSB7CiAgICAgICAgICAgICAgICAgICAgc2V0VGV4dChjdXJyZW50VXJsKCkpCiAgICAgICAgICAgICAgICAgICAgZ3Jhdml0eSA9IEdyYXZpdHkuU1RBUlQgb3IgR3Jhdml0eS5DRU5URVJfVkVSVElDQUwKICAgICAgICAgICAgICAgICAgICBwb3N0IHsgc2VsZWN0QWxsKCkgfQogICAgICAgICAgICAgICAgfSBlbHNlIHsKICAgICAgICAgICAgICAgICAgICBncmF2aXR5ID0gR3Jhdml0eS5DRU5URVIKICAgICAgICAgICAgICAgICAgICBzaG93VXJsKHRhYnMuZ2V0T3JOdWxsKGN1cik/LndlYi51cmwpCiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgIH0KICAgICAgICAgICAgc2V0T25FZGl0b3JBY3Rpb25MaXN0ZW5lciB7IF8sIGFjdGlvbiwgXyAtPgogICAgICAgICAgICAgICAgaWYgKGFjdGlvbiA9PSBFZGl0b3JJbmZvLklNRV9BQ1RJT05fR08pIHsKICAgICAgICAgICAgICAgICAgICBnbyh0ZXh0LnRvU3RyaW5nKCkpCiAgICAgICAgICAgICAgICAgICAgdHJ1ZQogICAgICAgICAgICAgICAgfSBlbHNlIGZhbHNlCiAgICAgICAgICAgIH0KICAgICAgICB9CiAgICAgICAgdGFiQnRuID0gaWNvbkJ0bigi4oqiIDEiKSB7IF8gLT4gc2hvd1RhYnMoKSB9LmFwcGx5IHsgdGV4dFNpemUgPSAxNmYgfQogICAgICAgIHZhbCB0b3BSb3cgPSBMaW5lYXJMYXlvdXQodGhpcykuYXBwbHkgewogICAgICAgICAgICBvcmllbnRhdGlvbiA9IExpbmVhckxheW91dC5IT1JJWk9OVEFMCiAgICAgICAgICAgIGdydXZzY2FsZSAqLzogc2V0UGFkZGluZyhkcCg0KSwgMCwgZHAoNCksIDApCiAgICAgICAgICAgIGxpc3RPZiggCiAgICAgICAgICAgICAgICBpY29uQnRuKCLil4siKSB7IF8gLT4gc2hvd01lbnUoaXQpIH0sCiAgICAgICAgICAgICAgICBpY29uQnRuKCLil4siKSB7IF8gLT4ge30gLy8gcGxhY2Vob2xkZXIKICAgICAgICAgICAgKS5mb3JFYWNoIHsgYWRkVmlldyhpdCwgTGluZWFyTGF5b3V0LkxheW91dFBhcmFtcygwLCAtMiwgMWYpKSB9CiAgICAgICAgfQogICAgICAgIHZhbCBuYXYgPSBMaW5lYXJMYXlvdXQodGhpcykuYXBwbHkgewogICAgICAgICAgICBvcmllbnRhdGlvbiA9IExpbmVhckxheW91dC5IT1JJWk9OVEFMCiAgICAgICAgICAgIGxpc3RPZiggCiAgICAgICAgICAgICAgICBpY29uQnRuKCLil6IpIHsgXyAtPiBpZiAod2ViKCkuY2FuR29CYWNrKCkpIHdlYigpLmdvQmFjaygpIH0sCiAgICAgICAgICAgICAgICBpY29uQnRuKCLil6MpIHsgXyAtPiBpZiAod2ViKCkuY2FuR29Gb3J3YXJkKCkpIHdlYigpLmdvRm9yd2FyZCgpIH0sCiAgICAgICAgICAgICAgICBpY29uQnRuKCLilrMpIHsgXyAtPiB3ZWIoKS5yZWxvYWQoKSB9LAogICAgICAgICAgICAgICAgaWNvbkJ0bigi4piGIikgeyBfIC0+IHRvZ2dsZUJvb2ttYXJrKCkgfSwKICAgICAgICAgICAgICAgIGljb25CdG4oIuKMgiIpIHsgXyAtPiBsb2FkKHRhYnNbY3VyXSwgSE9NRSkgfSwKICAgICAgICAgICAgKS5mb3JFYWNoIHsgYWRkVmlldyhpdCwgTGluZWFyTGF5b3V0LkxheW91dFBhcmFtcygwLCAtMiwgMWYpKSB9CiAgICAgICAgfQoKICAgICAgICByZXR1cm4gTGluZWFyTGF5b3V0KHRoaXMpLmFwcGx5IHsKICAgICAgICAgICAgb3JpZW50YXRpb24gPSBMaW5lYXJMYXlvdXQuVkVSVElDQUwKICAgICAgICAgICAgc2V0QmFja2dyb3VuZENvbG9yKGJnKQogICAgICAgICAgICBzZXRQYWRkaW5nKGRwKDEyKSwgZHAoOCksIGRwKDEyKSwgZHAoOCkpCiAgICAgICAgICAgIGVsZXZhdGlvbiA9IGRwKDQpLnRvRmxvYXQoKQogICAgICAgICAgICBhZGRWaWV3KHRvcFJvdywgTGluZWFyTGF5b3V0LkxheW91dFBhcmFtcygtMSwgLTIpKQogICAgICAgICAgICBhZGRWaWV3KHVybEJveCwgTGluZWFyTGF5b3V0LkxheW91dFBhcmFtcygtMSwgLTIpLmFsc28geyBpdC50b3BNYXJnaW4gPSBkcCg4KSB9KQogICAgICAgICAgICBhZGRWaWV3KG5hdiwgTGluZWFyTGF5b3V0LkxheW91dFBhcmFtcygtMSwgLTIpLmFsc28geyBpdC50b3BNYXJnaW4gPSBkcCg0KSB9KQogICAgICAgIH0KICAgIH0K").decode()
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
