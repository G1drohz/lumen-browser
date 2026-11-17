#!/usr/bin/env python3
from pathlib import Path
parts = sorted(Path("scripts").glob("mac_*.txt"))
if not parts:
    raise SystemExit("no mac_*.txt parts")
text = "".join(p.read_text() for p in parts)
out = Path("android/app/src/main/java/dev/g1drohz/lumen/MainActivity.kt")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(text)
assert "package" in text and "PLACEHOLDER" not in text
assert text.count("{") == text.count("}")
print("ok", len(text), "from", len(parts), "parts")
