#!/usr/bin/env python3
from pathlib import Path
import base64, zlib
parts = []
for i in range(1, 5):
    p = Path(f"scripts/mz{i}.txt")
    if p.exists():
        parts.append(p.read_text().strip())
if not parts:
    b64 = Path("scripts/ma_zlib.b64").read_text().strip()
else:
    b64 = "".join(parts)
data = zlib.decompress(base64.b64decode(b64))
out = Path("android/app/src/main/java/dev/g1drohz/lumen/MainActivity.kt")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(data)
text = data.decode()
assert "pillBg" in text and "PLACEHOLDER" not in text
print("MainActivity restored", len(data), "bytes")
