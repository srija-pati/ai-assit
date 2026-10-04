# LegalGPT: AI-Powered Legal Assistant (NVIDIA NIM API Edition)

LegalGPT is a full-stack legal information and document analysis platform powered by **NVIDIA NIM API**, **LangChain**, **ChromaDB**, **Flask**, and **SQLite**.

> **Disclaimer:** LegalGPT provides general legal information and document analysis for informational purposes. It does not replace advice from a qualified legal professional.

---

## Technical Architecture

```
                 ┌───────────────────────┐
                 │       Frontend        │
                 │ React / HTML/CSS/JS   │
                 └───────────┬───────────┘
                             │
                             ▼
                 ┌───────────────────────┐
                 │     Flask Backend     │
                 └───────┬───────┬───────┘
                         │       │
             ┌───────────┘       └─────────────┐
             ▼                                 ▼
      ┌──────────────┐                  ┌──────────────┐
      │    SQLite    │                  │   ChromaDB   │
      │ (legalgpt.db)│                  │              │
      │ Users        │                  │ RAG vectors  │
      │ Auth         │                  │ Embeddings   │
      │ History      │                  │ Datasets     │
      │ Documents    │                  │ Retrieval    │
      │ Emails       │                  └──────┬───────┘
      │ Datasets     │                         │
      └──────────────┘                         ▼
                                        ┌──────────────┐
                                        │  LangChain   │
                                        └──────┬───────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │ NVIDIA NIM API  │
                                      │  openai/gpt-oss │
                                      └────────┬────────┘
                                               │
                                               ▼
                                         Grounded Response
```

---

## Tech Stack

- **Frontend:** React 18 + Vite, TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Python + Flask, Flask-SQLAlchemy, PyMuPDF (`fitz`), python-docx
- **AI & RAG:** LangChain, `langchain-openai` (NVIDIA NIM API), ChromaDB
- **LLM Model:** Configurable via `.env` (`NVIDIA_MODEL=openai/gpt-oss-20b`)
- **Main Application Database:** SQLite (`legalgpt.db`)
- **PDF Generation:** ReportLab
- **Email Delivery:** Gmail SMTP (Python `smtplib` + `email.message`)

---

## Environment Variables (.env)

Create a `.env` file in root or `artifacts/flask-api/`:

```env
NVIDIA_API_KEY=your_nvidia_api_key
NVIDIA_MODEL=openai/gpt-oss-20b
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1

SECRET_KEY=legalgpt_secret_key_2026

DATABASE_URL=sqlite:///instance/legal_assistant.db
DATABASE_PATH=./legalgpt.db
CHROMA_PERSIST_DIRECTORY=./rag/chroma_db

CUSTOM_DATASET_PATH=./data/custom_dataset

TOP_K=5

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_google_app_password
SMTP_USE_TLS=true

MAIL_FROM=website@gmail.com
MAIL_FROM_NAME=Legal Assistant Bot

PORT=8080
```

---

## Custom Dataset Ingestion

To ingest or update the application's legal knowledge base:

```bash
python ingest_dataset.py
```

---

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@legalgpt.com` | `admin123` |
| User | `user@legalgpt.com` | `legalgpt@123` |

---

## Core Features

- **Auth & Users:** SQLite registration, secure password hashing, JWT bearer tokens, role authorization.
- **AI Chat & Grounded RAG:** Multi-source retrieval across user documents, developer custom legal dataset, and legal knowledge base via NVIDIA NIM API.
- **PyMuPDF Extraction:** Clean page text extraction for PDF, DOCX, and TXT.
- **Clause Extraction:** Automated risk analysis and key term extraction.
- **Legal Document Generator:** ReportLab PDF generation for NDAs, rental agreements, employment contracts, and legal notices.
- **Gmail SMTP Email System:** Send generated legal PDFs via Gmail SMTP with complete audit history.
- **Admin Panel:** User management, System audit logs, Dataset administration, Vector re-indexing.
