---
name: Flask backend setup
description: How the Python Flask backend is wired into the LegalGPT monorepo, replacing the original Node.js api-server.
---

## Key facts

- Flask app lives at `artifacts/flask-api/app.py` (NOT inside `artifacts/api-server/`)
- The artifact at `artifacts/api-server/` has its `artifact.toml` updated to run the Flask app
- The run command in `artifact.toml` must use an **absolute path**: `PORT=8080 python /home/runner/workspace/artifacts/flask-api/app.py`
  - Using `cd artifacts/flask-api && ...` fails because the working directory when the workflow runs is not the repo root

**Why:** The artifact's workflow runner doesn't guarantee a working directory, so relative paths in `run` break. Absolute paths always work.

**How to apply:** Any future changes to the Flask run command in `artifact.toml` must use `/home/runner/workspace/artifacts/flask-api/app.py`.

## Packages installed (pip, not pnpm)
- flask, flask-sqlalchemy, flask-cors
- langchain, langchain-google-genai, langchain-community, langchain-text-splitters (langchain-core)
- chromadb==0.6.3 (newer 1.x versions were 403-blocked by package firewall)
- reportlab

## PDF extraction runtime
- Prefer the installed `pdftotext` CLI for selectable PDF text, with `mutool` as the fallback; both are available in the current Replit runtime.
- **Why:** Python PDF package installs encountered the read-only Nix store, while Poppler and MuPDF tools were already available and preserve page boundaries.
- **How to apply:** Keep extraction server-side, retain per-page text markers, and return an explicit OCR-required error for scans rather than falling back to raw PDF bytes.

## LangChain import paths (current versions)
- Messages: `from langchain_core.messages import HumanMessage, AIMessage, SystemMessage`
- Text splitter: `from langchain_text_splitters import RecursiveCharacterTextSplitter`
- LLM: `from langchain_google_genai import ChatGoogleGenerativeAI`
- `from langchain.schema import ...` is WRONG — that module no longer exists

## Python f-string gotcha
- Python < 3.12 does NOT allow backslashes inside f-string expressions
- e.g. `f"{'\\n'.join(items)}"` is a syntax error — extract to a variable first

## Auth scheme (matches Node.js original)
- Password: SHA-256(password + "legalgpt_salt")
- Token: base64(userId:randomHex16)
- Admin seeded: admin@legalgpt.com / admin123

## ChromaDB telemetry warnings
- `capture() takes 1 positional argument but 3 were given` — harmless, from chromadb 0.6.3 posthog telemetry

## Database
- SQLite file: `artifacts/flask-api/legalgpt.db`
- ChromaDB store: `artifacts/flask-api/chroma_db/`
