import os
import sys
import glob
import re
import json
import secrets
import chromadb
from langchain_text_splitters import RecursiveCharacterTextSplitter

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.environ.get("CUSTOM_DATASET_PATH") or os.path.join(BASE_DIR, "data", "custom_dataset")
CHROMA_DIR = os.environ.get("CHROMA_PERSIST_DIRECTORY") or os.path.join(BASE_DIR, "rag", "chroma_db")

def clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\x00-\x08\x0b\x0e-\x1f\x7f]", " ", text)
    lines = [" ".join(line.split()) for line in text.split("\n")]
    return "\n".join(line for line in lines if line).strip()

def load_file_content(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext in (".txt", ".md", ".csv", ".json", ".jsonl"):
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    elif ext == ".pdf":
        try:
            import fitz
            doc = fitz.open(file_path)
            pages = [page.get_text("text") for page in doc]
            return "\n\n".join(pages)
        except Exception as exc:
            print(f"  Warning: Failed to extract PDF {file_path}: {exc}")
            return ""
    elif ext == ".docx":
        try:
            import docx
            doc = docx.Document(file_path)
            return "\n\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        except Exception as exc:
            print(f"  Warning: Failed to extract DOCX {file_path}: {exc}")
            return ""
    return ""

def main():
    print("=" * 60)
    print("  LEGALGPT - CUSTOM DATASET INGESTION PIPELINE")
    print("=" * 60)
    print(f"[Dataset Dir]   {DATASET_DIR}")
    print(f"[ChromaDB Dir]  {CHROMA_DIR}")
    print("-" * 60)

    if not os.path.exists(DATASET_DIR):
        os.makedirs(DATASET_DIR, exist_ok=True)
        print(f"Created custom dataset directory at {DATASET_DIR}")

    supported_extensions = ["*.txt", "*.pdf", "*.docx", "*.csv", "*.json", "*.md"]
    discovered_files = []
    for ext in supported_extensions:
        discovered_files.extend(glob.glob(os.path.join(DATASET_DIR, "**", ext), recursive=True))

    print(f"Files discovered: {len(discovered_files)}")
    if not discovered_files:
        print("  Warning: No dataset files found in custom_dataset directory.")
        return

    chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
    collection = chroma_client.get_or_create_collection("legal_datasets")

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

    processed_files = 0
    total_documents = 0
    total_chunks = 0

    for file_path in discovered_files:
        filename = os.path.basename(file_path)
        doc_title = os.path.splitext(filename)[0].replace("_", " ").title()
        print(f"Processing: {filename}...")

        raw_text = load_file_content(file_path)
        cleaned_text = clean_text(raw_text)

        if not cleaned_text or len(cleaned_text) < 10:
            print(f"  Skipped empty or unreadable file: {filename}")
            continue

        processed_files += 1
        total_documents += 1

        chunks = text_splitter.split_text(cleaned_text)
        chunk_ids = []
        documents = []
        metadatas = []

        clean_file_id = re.sub(r"[^a-zA-Z0-9_-]", "_", filename)

        for idx, chunk in enumerate(chunks):
            if len(chunk.strip()) < 10:
                continue
            chunk_id = f"ds_{clean_file_id}_chunk_{idx}_{secrets.token_hex(4)}"
            chunk_ids.append(chunk_id)
            documents.append(chunk)
            metadatas.append({
                "dataset_id": "custom_dataset",
                "dataset_name": "Custom Legal Knowledge Base",
                "source_type": "custom_dataset",
                "document_title": doc_title,
                "citation": f"File: {filename}",
                "jurisdiction": "India",
                "legal_domain": "General Legal Knowledge",
                "chunk_id": f"chunk_{idx}",
            })

        if documents:
            collection.add(documents=documents, ids=chunk_ids, metadatas=metadatas)
            total_chunks += len(documents)
            print(f"  + Indexed {len(documents)} chunks for '{doc_title}'")

    print("=" * 60)
    print("DATASET INGESTION SUMMARY REPORT")
    print("=" * 60)
    print(f"* Files discovered:  {len(discovered_files)}")
    print(f"* Files processed:   {processed_files}")
    print(f"* Documents loaded:  {total_documents}")
    print(f"* Chunks indexed:    {total_chunks}")
    print(f"* Embeddings:        Stored in ChromaDB collection 'legal_datasets'")
    print(f"* ChromaDB status:   Active ({collection.count()} total vectors in dataset store)")
    print("=" * 60)
    print("Custom legal dataset successfully ingested and available for RAG!")

if __name__ == "__main__":
    main()
