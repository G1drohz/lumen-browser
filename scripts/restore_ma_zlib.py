#!/usr/bin/env python3
"""Restore MainActivity.kt from zlib+base64 (Ecosia top bar v3.3.0)."""
from pathlib import Path
import base64, zlib
b64 = Path("scripts/ma_zlib.b64").read_text().strip()
data = zlib.decompress(base64.b64decode(b64))
out = Path("android/app/src/main/java/dev/g1drohz/lumen/MainActivity.kt")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(data)
text = data.decode()
assert "pillBg" in text and "LUMEN" in text and "PLACEHOLDER" not in text
assert text.count("{") == text.count("}")
print("MainActivity restored", len(data), "bytes")
