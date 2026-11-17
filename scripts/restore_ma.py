#!/usr/bin/env python3
import base64
from pathlib import Path
b64 = Path("scripts/ma_part1.txt").read_text() + Path("scripts/ma_part2.txt").read_text() + Path("scripts/ma_part3.txt").read_text()
Path("android/app/src/main/java/dev/g1drohz/lumen/MainActivity.kt").write_bytes(base64.b64decode(b64))
print("ok", Path("android/app/src/main/java/dev/g1drohz/lumen/MainActivity.kt").stat().st_size)
