import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", ".."))
INGEST_SCRIPT = os.path.join(ROOT_DIR, "ingest_dataset.py")

if os.path.exists(INGEST_SCRIPT):
    with open(INGEST_SCRIPT, "r", encoding="utf-8") as f:
        code = f.read()
    exec(compile(code, INGEST_SCRIPT, 'exec'))
else:
    print(f"Error: Ingestion script not found at {INGEST_SCRIPT}")
