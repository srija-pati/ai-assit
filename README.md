# LegalGPT: AI-Powered Legal Assistant

LegalGPT is a full-stack web application that helps users analyze legal documents, extract clauses, draft contracts, ask legal questions, and generate formal letters using RAG (Retrieval-Augmented Generation) and LLM support.

> **Disclaimer:** This system provides AI-assisted legal information, not professional legal advice.

---

## Demo Login Credentials

| Role  | Email                  | Password  |
|-------|------------------------|-----------|
| Admin | admin@legalgpt.com     | admin123  |
| User  | user@legalgpt.com      | user123   |

---

## Tech Stack

**Frontend:**
- React 18 + Vite, TypeScript
- Tailwind CSS + shadcn/ui components
- TanStack React Query (Orval codegen hooks)
- Wouter (routing), next-themes (dark/light mode)
- Framer Motion (animations)

**Backend:**
- Node.js + Express 5, TypeScript
- PostgreSQL + Drizzle ORM
- Mock AI responses (ready for Ollama integration locally)
- Zod validation

**AI/RAG (Local Setup):**
- LangChain + ChromaDB (vector store)
- Ollama (local LLM)

---

## How to Run on Replit

The app runs automatically on Replit. Two workflows start:

1. **API Server** — Express backend on port 8080 (`/api`)
2. **LegalGPT Web** — React frontend (root path `/`)

The AI responses use smart mock data on Replit (since Ollama requires a local GPU).

---

## How to Run Locally on Laptop

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- PostgreSQL database

### Backend Setup

```bash
# Install all dependencies
pnpm install

# Set environment variables
cp .env.example .env
# Edit .env and set DATABASE_URL

# Push database schema
pnpm --filter @workspace/db run push

# Start the API server
pnpm --filter @workspace/api-server run dev
```

### Frontend Setup

```bash
# Run codegen (regenerate API hooks)
pnpm --filter @workspace/api-spec run codegen

# Start the frontend
pnpm --filter @workspace/legal-gpt run dev
```

---

## How to Install Ollama Locally

Ollama lets you run LLMs (like LLaMA 3) directly on your laptop.

### Step 1: Install Ollama

**macOS / Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:** Download from [https://ollama.ai/download](https://ollama.ai/download)

### Step 2: Pull the LLaMA 3 Model

```bash
ollama pull llama3
```

This downloads ~4.7GB. Wait for it to complete.

### Step 3: Start Ollama Server

```bash
ollama serve
```

This starts the Ollama API at `http://localhost:11434`.

### Step 4: Configure LegalGPT Backend

In the backend chat route (`artifacts/api-server/src/routes/chat.ts`), replace the mock response function with a real Ollama call:

```typescript
// Replace getMockResponse() with:
const response = await fetch("http://localhost:11434/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "llama3",
    prompt: `You are a legal assistant. Answer this question: ${message}`,
    stream: false,
  }),
});
const data = await response.json();
return data.response;
```

---

## How RAG Works

The RAG (Retrieval-Augmented Generation) pipeline works as follows:

```
1. Upload Document (PDF/DOCX)
        ↓
2. Text Extraction (extract raw text from file)
        ↓
3. Chunking (split into 500-token overlapping chunks)
        ↓
4. Embeddings (convert chunks to vector embeddings)
        ↓
5. ChromaDB Vector Store (store embeddings for fast retrieval)
        ↓
6. User Query → Retrieval (find top-K relevant chunks)
        ↓
7. LLM Response (Ollama LLaMA 3 generates answer with context)
        ↓
8. PDF / Email Output (download or send the response)
```

**Why RAG?**
Without RAG, the LLM answers from general knowledge only. With RAG, it retrieves the exact relevant passages from your uploaded document and uses them as context — giving precise, document-grounded answers.

---

## Features

| Page               | Feature |
|--------------------|---------|
| Landing Page       | Hero, RAG workflow visualization, feature highlights |
| Login / Signup     | JWT-like token auth, role-based access |
| Dashboard          | Stats cards, recent activity feed |
| Document Upload    | PDF/DOCX upload, status tracking, file actions |
| AI Chat            | ChatGPT-like interface with document context |
| Clause Extraction  | Auto-extract parties, dates, payment terms, risk clauses |
| Document Generator | NDA, rental, employment, legal notice generation |
| Advocate Search    | Directory with filters (city, specialization, rating) |
| Email Sending      | Send generated letters by email |
| Admin Dashboard    | System stats, user/document management, re-index |
| Settings           | Profile edit, dark/light mode toggle |

---

## Project Explanation (for Final-Year Viva)

### Problem Statement
Legal documents are complex and expensive to review. Most people cannot afford a lawyer for every contract or notice they encounter. LegalGPT democratizes access to legal information using AI.

### Solution
LegalGPT uses RAG (Retrieval-Augmented Generation) to:
1. Accept uploaded legal documents
2. Chunk and embed them into a vector database (ChromaDB)
3. Retrieve relevant passages when users ask questions
4. Generate precise, context-aware answers using an LLM (LLaMA 3 via Ollama)

### Technical Architecture
- **Frontend**: React + Vite SPA with real-time API integration
- **Backend**: Express REST API with PostgreSQL for persistence
- **AI Layer**: LangChain orchestrates the RAG pipeline; ChromaDB stores vector embeddings; Ollama runs the local LLM
- **Contract-first API**: OpenAPI spec → Orval codegen → TypeScript hooks (type-safe end-to-end)

### Key Contributions
1. End-to-end RAG pipeline implementation
2. Legal document clause extraction engine
3. AI-powered legal document generator
4. Advocate directory with smart filtering
5. Complete admin dashboard with system analytics

### Limitations
- Not a substitute for professional legal advice
- LLM responses are probabilistic and may contain errors
- Ollama requires GPU/CPU resources not available on all cloud platforms

---

## Environment Variables

```env
DATABASE_URL=postgresql://user:password@localhost:5432/legalgpt
SESSION_SECRET=your-secret-key-here
PORT=8080
NODE_ENV=development
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/documents` | List documents |
| POST | `/api/documents` | Upload document |
| DELETE | `/api/documents/:id` | Delete document |
| POST | `/api/chat` | Send AI chat message |
| GET | `/api/chat/history` | Get chat history |
| POST | `/api/extract-clauses` | Extract clauses |
| POST | `/api/generate-document` | Generate legal document |
| GET | `/api/drafts` | List generated drafts |
| GET | `/api/advocates` | Search advocates |
| POST | `/api/send-email` | Send legal letter |
| GET | `/api/admin/stats` | Admin statistics |
| GET | `/api/admin/users` | List all users |
| GET | `/api/history` | Activity history |
| GET | `/api/dashboard/summary` | Dashboard summary |
