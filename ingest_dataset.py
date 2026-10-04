import os
import sys
import glob
import re
import json
import csv
import io
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

DATASET_NAME = "Jud-IPL Indian Legal Judgment Prediction Dataset"

def clean_text(text: str) -> str:
    text = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\x00-\x08\x0b\x0e-\x1f\x7f]", " ", text)
    lines = [" ".join(line.split()) for line in text.split("\n")]
    return "\n".join(line for line in lines if line).strip()

def process_csv_file(file_path: str, collection, text_splitter) -> tuple[int, int]:
    filename = os.path.basename(file_path)
    indexed_docs = 0
    total_chunks = 0
    
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row_idx, row in enumerate(reader):
            case_id = row.get("case_id") or row.get("id") or row.get("judgment_id") or f"jud_ipl_{row_idx + 1}"
            case_title = row.get("case_title") or row.get("title") or row.get("name") or f"Jud-IPL Case #{case_id}"
            raw_text = row.get("judgment_text") or row.get("text") or row.get("content") or row.get("facts") or json.dumps(row)
            court = row.get("court") or row.get("jurisdiction") or "Supreme Court of India"
            category = row.get("category") or row.get("case_type") or "Legal Judgment"
            date = row.get("judgment_date") or row.get("date") or "N/A"
            outcome = row.get("outcome") or row.get("label") or row.get("target") or "N/A"

            cleaned = clean_text(raw_text)
            if len(cleaned) < 10:
                continue

            indexed_docs += 1
            chunks = text_splitter.split_text(cleaned)

            chunk_ids = []
            documents = []
            metadatas = []

            for idx, chunk in enumerate(chunks):
                if len(chunk.strip()) < 10:
                    continue
                cid = f"jud_ipl_{re.sub(r'[^a-zA-Z0-9_-]', '_', str(case_id))}_chunk_{idx}_{secrets.token_hex(4)}"
                chunk_ids.append(cid)
                documents.append(chunk)
                
                citation_parts = [f"Case ID: {case_id}", f"Court: {court}", f"Category: {category}"]
                if date != "N/A":
                    citation_parts.append(f"Date: {date}")
                
                metadatas.append({
                    "dataset_id": "jud_ipl",
                    "dataset_name": DATASET_NAME,
                    "source_type": "custom_dataset",
                    "document_title": str(case_title),
                    "citation": " | ".join(citation_parts),
                    "case_id": str(case_id),
                    "court": str(court),
                    "category": str(category),
                    "judgment_date": str(date),
                    "outcome": str(outcome),
                    "original_file": filename,
                    "row_index": str(row_idx + 1),
                    "jurisdiction": "India",
                    "legal_domain": str(category),
                    "chunk_id": f"chunk_{idx}",
                })

            if documents:
                collection.add(documents=documents, ids=chunk_ids, metadatas=metadatas)
                total_chunks += len(documents)

    return indexed_docs, total_chunks

def process_json_file(file_path: str, collection, text_splitter) -> tuple[int, int]:
    filename = os.path.basename(file_path)
    indexed_docs = 0
    total_chunks = 0

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        try:
            data = json.load(f)
        except Exception:
            return 0, 0

    records = data if isinstance(data, list) else [data]
    for row_idx, row in enumerate(records):
        if not isinstance(row, dict):
            continue
        case_id = row.get("case_id") or row.get("id") or f"jud_ipl_{row_idx + 1}"
        case_title = row.get("case_title") or row.get("title") or f"Jud-IPL Case #{case_id}"
        raw_text = row.get("judgment_text") or row.get("text") or row.get("content") or json.dumps(row)
        court = row.get("court") or "Supreme Court of India"
        category = row.get("category") or row.get("case_type") or "Legal Judgment"
        date = row.get("judgment_date") or row.get("date") or "N/A"

        cleaned = clean_text(raw_text)
        if len(cleaned) < 10:
            continue

        indexed_docs += 1
        chunks = text_splitter.split_text(cleaned)

        chunk_ids = []
        documents = []
        metadatas = []

        for idx, chunk in enumerate(chunks):
            if len(chunk.strip()) < 10:
                continue
            cid = f"jud_ipl_{re.sub(r'[^a-zA-Z0-9_-]', '_', str(case_id))}_chunk_{idx}_{secrets.token_hex(4)}"
            chunk_ids.append(cid)
            documents.append(chunk)

            metadatas.append({
                "dataset_id": "jud_ipl",
                "dataset_name": DATASET_NAME,
                "source_type": "custom_dataset",
                "document_title": str(case_title),
                "citation": f"Case ID: {case_id} | Court: {court} | Category: {category}",
                "case_id": str(case_id),
                "court": str(court),
                "category": str(category),
                "judgment_date": str(date),
                "original_file": filename,
                "row_index": str(row_idx + 1),
                "jurisdiction": "India",
                "legal_domain": str(category),
                "chunk_id": f"chunk_{idx}",
            })

        if documents:
            collection.add(documents=documents, ids=chunk_ids, metadatas=metadatas)
            total_chunks += len(documents)

    return indexed_docs, total_chunks

def load_file_content(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext in (".txt", ".md"):
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
    print("=" * 65)
    print("  LEGALGPT - JUD-IPL DATASET INGESTION PIPELINE")
    print("=" * 65)
    print(f"[Dataset Dir]   {DATASET_DIR}")
    print(f"[ChromaDB Dir]  {CHROMA_DIR}")
    print("-" * 65)

    if not os.path.exists(DATASET_DIR):
        os.makedirs(DATASET_DIR, exist_ok=True)
        print(f"Created custom dataset directory at {DATASET_DIR}")

    supported_extensions = ["*.txt", "*.pdf", "*.docx", "*.csv", "*.json", "*.jsonl", "*.md"]
    discovered_files = []
    for ext in supported_extensions:
        discovered_files.extend(glob.glob(os.path.join(DATASET_DIR, "**", ext), recursive=True))

    print(f"Files discovered in custom_dataset: {len(discovered_files)}")
    if not discovered_files:
        print("\n  [SETUP INSTRUCTIONS FOR DEVELOPER]")
        print("  1. Download the Jud-IPL Dataset from Kaggle: https://www.kaggle.com/dsv/14441669")
        print(f"  2. Place the extracted dataset CSV/JSON/TXT files into:")
        print(f"     -> {DATASET_DIR}")
        print("  3. Re-run this ingestion script to populate ChromaDB:")
        print("     -> python ingest_dataset.py\n")
        return

    chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
    collection = chroma_client.get_or_create_collection("legal_datasets")

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

    processed_files = 0
    total_documents = 0
    total_chunks = 0

    for file_path in discovered_files:
        filename = os.path.basename(file_path)
        ext = os.path.splitext(filename)[1].lower()
        print(f"Processing: {filename}...")

        if ext == ".csv":
            docs, chunks = process_csv_file(file_path, collection, text_splitter)
            processed_files += 1
            total_documents += docs
            total_chunks += chunks
            print(f"  + Indexed {docs} records / {chunks} chunks from CSV '{filename}'")
        elif ext in (".json", ".jsonl"):
            docs, chunks = process_json_file(file_path, collection, text_splitter)
            processed_files += 1
            total_documents += docs
            total_chunks += chunks
            print(f"  + Indexed {docs} records / {chunks} chunks from JSON '{filename}'")
        else:
            doc_title = os.path.splitext(filename)[0].replace("_", " ").title()
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
                chunk_id = f"jud_ipl_{clean_file_id}_chunk_{idx}_{secrets.token_hex(4)}"
                chunk_ids.append(chunk_id)
                documents.append(chunk)
                metadatas.append({
                    "dataset_id": "jud_ipl",
                    "dataset_name": DATASET_NAME,
                    "source_type": "custom_dataset",
                    "document_title": doc_title,
                    "citation": f"File: {filename}",
                    "court": "Supreme Court of India",
                    "category": "Jud-IPL Legal Judgment",
                    "jurisdiction": "India",
                    "legal_domain": "Indian Legal Judgments",
                    "chunk_id": f"chunk_{idx}",
                })

            if documents:
                collection.add(documents=documents, ids=chunk_ids, metadatas=metadatas)
                total_chunks += len(documents)
                print(f"  + Indexed {len(documents)} chunks for '{doc_title}'")

    print("=" * 65)
    print("JUD-IPL DATASET INGESTION SUMMARY REPORT")
    print("=" * 65)
    print(f"* Files processed:   {processed_files}")
    print(f"* Documents loaded:  {total_documents}")
    print(f"* Chunks indexed:    {total_chunks}")
    print(f"* Vector Store:      ChromaDB collection 'legal_datasets'")
    print(f"* Total vectors:     {collection.count()} vectors in database")
    print("=" * 65)
    print("Jud-IPL custom legal dataset ready for RAG querying!")

if __name__ == "__main__":
    main()
