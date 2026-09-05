"""Genera N archivos fake para probar escala 100K sin I/O real pesado."""
import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else "/tmp/cdc_seed"
n = int(sys.argv[2]) if len(sys.argv) > 2 else 10000
os.makedirs(root, exist_ok=True)
for i in range(n):
    ext = ["mp3", "jpg", "pdf", "txt"][i % 4]
    with open(os.path.join(root, f"file_{i:06d}.{ext}"), "w") as f:
        f.write("x" * 64)
print(f"seeded {n} files in {root}")
