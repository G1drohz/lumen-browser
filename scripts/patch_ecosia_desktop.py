#!/usr/bin/env python3
from pathlib import Path
css_path = Path("desktop/renderer/style.css")
css = css_path.read_text()
extras = """
/* Ecosia-like top + smooth motion */
:root{--ease:cubic-bezier(.22,.68,0,1.2);--ease-out:cubic-bezier(.16,1,.3,1);--t:.22s}
#top{
  position:fixed;inset:0 0 auto 0;z-index:2;
  background:color-mix(in srgb,var(--bar) 92%,transparent);
  backdrop-filter:blur(16px) saturate(1.2);
  -webkit-backdrop-filter:blur(16px) saturate(1.2);
  border-bottom:1px solid color-mix(in srgb,var(--line) 80%,transparent);
  transition:background var(--t) var(--ease-out),border-color var(--t) var(--ease-out);
}
#bar{
  height:calc(48px * var(--ui));
  display:flex;align-items:center;gap:10px;
  padding:0 14px;
  -webkit-app-region:drag;
}
.darwin #bar{padding-left:calc(84px * var(--ui))}
.win32 #bar,.linux #bar{padding-right:calc(150px * var(--ui))}
.nav{display:flex;gap:4px;-webkit-app-region:no-drag}
.nav button,#newtab,#star,#zoom,#fill,#home,#side button,#find button{
  transition:transform var(--t) var(--ease),background var(--t) var(--ease-out),color var(--t) var(--ease-out),opacity var(--t) var(--ease-out),box-shadow var(--t) var(--ease-out);
}
.nav button:hover,#newtab:hover,#star:hover,#side button:hover{transform:scale(1.06)}
.nav button:active,#newtab:active,#star:active,#side button:active{transform:scale(.94)}
#omni{
  flex:1;min-width:0;height:calc(36px * var(--ui));
  display:flex;align-items:center;gap:6px;
  padding:0 12px 0 14px;
  border-radius:999px;
  background:var(--pill);
  border:1px solid transparent;
  -webkit-app-region:no-drag;
  transition:background var(--t) var(--ease-out),box-shadow var(--t) var(--ease-out),border-color var(--t) var(--ease-out),transform var(--t) var(--ease);
}
#omni:focus-within{
  background:color-mix(in srgb,var(--pill) 70%,var(--bg));
  border-color:color-mix(in srgb,var(--accent) 45%,transparent);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 22%,transparent),0 4px 18px rgba(0,0,0,.12);
  transform:translateY(-.5px);
}
#url{flex:1;min-width:0;border:0;outline:0;background:none;color:inherit;font:inherit;text-align:center;user-select:text;transition:text-align .15s ease}
#url:focus{text-align:left}
#tabs-row{display:flex;align-items:center;gap:4px;padding:0 8px 6px;-webkit-app-region:drag}
#tabs{display:flex;gap:4px;overflow:hidden;flex:0 1 auto;max-width:calc(100% - 36px)}
.tab{transition:background var(--t) var(--ease-out),transform var(--t) var(--ease),opacity var(--t) var(--ease-out),max-width .28s var(--ease-out)}
.tab:hover{transform:translateY(-1px)}
.tab.active{box-shadow:0 2px 10px color-mix(in srgb,var(--accent) 25%,transparent)}
.tab .x{transition:opacity var(--t) var(--ease-out),background var(--t) var(--ease-out)}
#panel{transition:transform .28s var(--ease-out),opacity .22s var(--ease-out)}
#panel:not([hidden]){animation:panelIn .28s var(--ease-out)}
@keyframes panelIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
#newtab{border-radius:10px}
"""
if "Ecosia-like top" not in css:
    css_path.write_text(css.rstrip() + "\n" + extras)
    print("css ok")
else:
    print("css already")
pkg = Path("desktop/package.json")
if pkg.exists():
    t = pkg.read_text()
    for a,b in [('\"version\": \"3.2.5\"', '\"version\": \"3.3.0\"'), ('\"version\": \"3.2.4\"', '\"version\": \"3.3.0\"'), ('\"version\": \"3.2.3\"', '\"version\": \"3.3.0\"')]:
        t = t.replace(a,b)
    pkg.write_text(t)
print("desktop done")
