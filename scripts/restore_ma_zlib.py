#!/usr/bin/env python3
"""Restore MainActivity from last known-good git blob if current is PLACEHOLDER."""
from pathlib import Path
import subprocess
p = Path("android/app/src/main/java/dev/g1drohz/lumen/MainActivity.kt")
c = p.read_text() if p.exists() else ""
if "PLACEHOLDER" in c or len(c) < 500:
    blob = "bb1581bfe1bd4357b5980d740c394234ab2072c7:android/app/src/main/java/dev/g1drohz/lumen/MainActivity.kt"
    data = subprocess.check_output(["git", "show", blob])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    print("restored from", blob, len(data))
else:
    print("MainActivity ok", len(c))
