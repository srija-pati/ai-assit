import os
import hashlib
import base64
import secrets
import datetime
import html
import json
import math
import re
import shutil
import subprocess
import threading
import tempfile
import time
import unicodedata
import zipfile
from socket import timeout as SocketTimeout
from email.utils import formataddr
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from xml.etree import ElementTree
from werkzeug.utils import secure_filename

from flask import Flask, request, jsonify, g
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch
from reportlab.lib import colors
import io

# ── LangChain + Gemini ────────────────────────────────────────────────────────
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_text_splitters import RecursiveCharacterTextSplitter
import chromadb

# ── App setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
MAX_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_DOCUMENT_REQUEST_BYTES = 75 * 1024 * 1024
MAX_EXTRACTED_TEXT_BYTES = 10 * 1024 * 1024

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH  = os.path.join(BASE_DIR, "legalgpt.db")
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

# ── ChromaDB ──────────────────────────────────────────────────────────────────
CHROMA_PATH = os.path.join(BASE_DIR, "chroma_db")
chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
chroma_collection = chroma_client.get_or_create_collection("legal_documents")

# ── LangChain LLM ─────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=GEMINI_API_KEY,
    temperature=0.3,
    max_output_tokens=8192,
) if GEMINI_API_KEY else None

text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

# ═══════════════════════════════════════════════════════════════════════════════
# Models (SQLite via Flask-SQLAlchemy)
# ═══════════════════════════════════════════════════════════════════════════════

class User(db.Model):
    __tablename__ = "users"
    id            = db.Column(db.Integer, primary_key=True)
    name          = db.Column(db.String(200), nullable=False)
    email         = db.Column(db.String(200), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    role          = db.Column(db.String(50), default="user")
    created_at    = db.Column(db.DateTime, default=datetime.datetime.utcnow)


class Document(db.Model):
    __tablename__ = "documents"
    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(500), nullable=False)
    size        = db.Column(db.Integer, nullable=False)
    type        = db.Column(db.String(100), nullable=False)
    status      = db.Column(db.String(50), default="processed")
    content     = db.Column(db.Text)
    summary     = db.Column(db.Text)
    upload_date = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    user_id     = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)


class ChatHistory(db.Model):
    __tablename__ = "chat_history"
    id          = db.Column(db.Integer, primary_key=True)
    role        = db.Column(db.String(20), nullable=False)
    content     = db.Column(db.Text, nullable=False)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"))
    session_id  = db.Column(db.String(100))
    sources     = db.Column(db.Text)
    user_id     = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at  = db.Column(db.DateTime, default=datetime.datetime.utcnow)


class GeneratedDraft(db.Model):
    __tablename__ = "generated_drafts"
    id            = db.Column(db.Integer, primary_key=True)
    document_type = db.Column(db.String(100), nullable=False)
    title         = db.Column(db.String(500), nullable=False)
    content       = db.Column(db.Text, nullable=False)
    client_name   = db.Column(db.String(200))
    opposite_name = db.Column(db.String(200))
    address       = db.Column(db.Text)
    purpose       = db.Column(db.Text)
    jurisdiction  = db.Column(db.String(200))
    user_id       = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at    = db.Column(db.DateTime, default=datetime.datetime.utcnow)


class SentEmail(db.Model):
    __tablename__ = "sent_emails"
    id              = db.Column(db.Integer, primary_key=True)
    recipient_email = db.Column(db.String(200), nullable=False)
    sender_name     = db.Column(db.String(200))
    sender_email    = db.Column(db.String(254))
    subject         = db.Column(db.String(500), nullable=False)
    body            = db.Column(db.Text, nullable=False)
    draft_id        = db.Column(db.Integer, db.ForeignKey("generated_drafts.id"))
    resend_message_id = db.Column(db.String(200))
    status          = db.Column(db.String(50), default="sent")
    sent_at         = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    user_id         = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)


class AdminLog(db.Model):
    __tablename__ = "admin_logs"
    id         = db.Column(db.Integer, primary_key=True)
    action     = db.Column(db.String(200), nullable=False)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"))
    details    = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)


# ═══════════════════════════════════════════════════════════════════════════════
# Auth helpers
# ═══════════════════════════════════════════════════════════════════════════════

def hash_password(password: str) -> str:
    return hashlib.sha256((password + "legalgpt_salt").encode()).hexdigest()

def generate_token(user_id: int) -> str:
    raw = f"{user_id}:{secrets.token_hex(16)}"
    return base64.b64encode(raw.encode()).decode()

def decode_token(token: str):
    try:
        decoded = base64.b64decode(token.encode()).decode()
        user_id = int(decoded.split(":")[0])
        return user_id
    except Exception:
        return None

def get_current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    user_id = decode_token(token)
    if not user_id:
        return None
    return User.query.get(user_id)

def require_auth(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        g.user = user
        return f(*args, **kwargs)
    return decorated

def log_action(action: str, user_id: int, details: str = ""):
    try:
        entry = AdminLog(action=action, user_id=user_id, details=details)
        db.session.add(entry)
        db.session.commit()
    except Exception:
        pass

# ═══════════════════════════════════════════════════════════════════════════════
# ChromaDB / RAG helpers
# ═══════════════════════════════════════════════════════════════════════════════

def clean_extracted_text(value: str) -> str:
    """Normalize readable document text without dropping non-ASCII legal text."""
    value = unicodedata.normalize("NFKC", value or "")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[\x00-\x08\x0b\x0e-\x1f\x7f]", " ", value)
    lines = [" ".join(line.split()) for line in value.split("\n")]
    return "\n".join(line for line in lines if line).strip()


def looks_like_pdf_structure(value: str) -> bool:
    """Identify legacy uploads where PDF object data was stored as text."""
    sample = (value or "")[:12000].lower()
    if sample.lstrip().startswith("%pdf-"):
        return True
    technical_markers = (
        "/type /page", "/type /font", "endobj", "stream", "xref",
        "/mediabox", "/contents ", "/length ",
    )
    return sum(marker in sample for marker in technical_markers) >= 3


def _extract_pdf_pages(file_bytes: bytes) -> list[str]:
    """Extract page text with Poppler, falling back to the installed MuPDF CLI."""
    with tempfile.TemporaryDirectory(prefix="legalgpt-pdf-") as temp_directory:
        pdf_path = os.path.join(temp_directory, "document.pdf")
        text_path = os.path.join(temp_directory, "extracted.txt")
        with open(pdf_path, "wb") as temp_file:
            temp_file.write(file_bytes)
        if shutil.which("pdftotext"):
            command = ["pdftotext", "-enc", "UTF-8", "-layout", pdf_path, text_path]
        elif shutil.which("mutool"):
            command = ["mutool", "draw", "-F", "txt", "-o", text_path, pdf_path]
        else:
            raise RuntimeError("PDF text extraction is unavailable on this server.")
        try:
            result = subprocess.run(
                command, capture_output=True, timeout=60, check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise ValueError("This PDF took too long to process. Try a smaller file.") from exc
        if result.returncode != 0:
            raise ValueError("This PDF could not be read. Check that it is a valid PDF and try again.")
        try:
            output_size = os.path.getsize(text_path)
            if output_size > MAX_EXTRACTED_TEXT_BYTES:
                raise ValueError("The extracted document text is too large to process.")
            with open(text_path, "r", encoding="utf-8", errors="replace") as extracted_file:
                extracted_text = extracted_file.read()
        except OSError as exc:
            raise ValueError("This PDF could not be read. Check that it is a valid PDF and try again.") from exc

    pages = [clean_extracted_text(page) for page in extracted_text.split("\f")]
    pages = [page for page in pages if page]
    if not pages:
        raise ValueError(
            "This PDF has no selectable text. OCR is required for scanned PDFs before upload."
        )
    if sum(len(page) for page in pages) < 20:
        raise ValueError(
            "This PDF has too little selectable text to analyze. OCR is required if it is scanned."
        )
    return pages


def _extract_docx_text(file_bytes: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            entries = archive.infolist()
            names = {entry.filename for entry in entries}
            if (
                len(entries) > 2000
                or sum(entry.file_size for entry in entries) > 100 * 1024 * 1024
                or "[Content_Types].xml" not in names
                or "word/document.xml" not in names
                or any(name.lower().endswith("vbaproject.bin") for name in names)
            ):
                raise ValueError("This is not a supported DOCX document.")
            document_xml = archive.read("word/document.xml")
    except (zipfile.BadZipFile, KeyError, OSError) as exc:
        raise ValueError("This is not a valid DOCX document.") from exc

    try:
        root = ElementTree.fromstring(document_xml)
    except ElementTree.ParseError as exc:
        raise ValueError("This DOCX document could not be read.") from exc

    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    paragraphs = []
    for paragraph in root.iter(f"{namespace}p"):
        parts = []
        for node in paragraph.iter():
            if node.tag == f"{namespace}t":
                parts.append(node.text or "")
            elif node.tag == f"{namespace}tab":
                parts.append("\t")
            elif node.tag in (f"{namespace}br", f"{namespace}cr"):
                parts.append("\n")
        text = clean_extracted_text("".join(parts))
        if text:
            paragraphs.append(text)
    return "\n\n".join(paragraphs)


def extract_document_text(filename: str, file_bytes: bytes) -> str:
    """Extract readable content from an uploaded PDF, DOCX, or UTF-8 TXT file."""
    extension = os.path.splitext(filename.lower())[1]
    if extension == ".pdf":
        pages = _extract_pdf_pages(file_bytes)
        return "\n\n".join(f"[Page {index}]\n{page}" for index, page in enumerate(pages, 1))
    if extension == ".docx":
        content = _extract_docx_text(file_bytes)
    elif extension == ".txt":
        try:
            content = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("Text documents must use UTF-8 encoding.") from exc
        if "\x00" in content:
            raise ValueError("This is not a valid text document.")
    else:
        raise ValueError("Only PDF, DOCX, or TXT documents are supported.")

    content = clean_extracted_text(content)
    if len(content) < 10:
        raise ValueError("No readable text was found in this document.")
    return content


def remove_document_index(doc_id: int):
    try:
        existing = chroma_collection.get(where={"doc_id": str(doc_id)})
        if existing.get("ids"):
            chroma_collection.delete(ids=existing["ids"])
    except Exception as exc:
        app.logger.warning("Could not remove stale document index %s: %s", doc_id, type(exc).__name__)


def index_document(doc_id: int, content: str):
    """Index clean extracted text and retain page numbers in chunk metadata."""
    remove_document_index(doc_id)
    if not content or len(content.strip()) < 10 or looks_like_pdf_structure(content):
        return

    page_sections = re.findall(
        r"(?ms)^\[Page (\d+)\]\s*\n(.*?)(?=^\[Page \d+\]\s*\n|\Z)",
        content,
    )
    indexed_chunks = []
    metadatas = []
    try:
        sections = [(int(page), text) for page, text in page_sections] if page_sections else [(None, content)]
        for page_number, text in sections:
            for chunk in text_splitter.split_text(text.strip()):
                if len(chunk.strip()) < 10:
                    continue
                indexed_chunks.append(chunk)
                metadata = {"doc_id": str(doc_id), "chunk": len(indexed_chunks) - 1}
                if page_number is not None:
                    metadata["page"] = page_number
                metadatas.append(metadata)
        if indexed_chunks:
            ids = [f"doc_{doc_id}_chunk_{index}" for index in range(len(indexed_chunks))]
            chroma_collection.add(documents=indexed_chunks, ids=ids, metadatas=metadatas)
    except Exception as exc:
        app.logger.warning("ChromaDB index error: %s", type(exc).__name__)


def retrieve_context(doc_id: int, query: str, n_results: int = 6) -> str:
    """Retrieve relevant extracted chunks and include page citations when available."""
    try:
        results = chroma_collection.query(
            query_texts=[query],
            n_results=n_results,
            where={"doc_id": str(doc_id)},
        )
        docs = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        if not docs:
            return ""
        context = []
        for index, text in enumerate(docs):
            metadata = metadatas[index] if index < len(metadatas) else {}
            page_number = metadata.get("page") if metadata else None
            prefix = f"[Page {page_number}]\n" if page_number is not None else ""
            context.append(prefix + text)
        return "\n\n".join(context)
    except Exception as exc:
        app.logger.warning("ChromaDB retrieval error: %s", type(exc).__name__)
        return ""

# ═══════════════════════════════════════════════════════════════════════════════
# AI chat helper
# ═══════════════════════════════════════════════════════════════════════════════

LEGAL_SYSTEM_PROMPT = """You are LegalGPT, an expert AI legal assistant. You have deep knowledge of law including contracts, NDAs, employment law, property law, corporate law, family law, consumer protection, and more.

When a user uploads a document, you analyse it carefully and answer questions based on its actual content. You:
- Quote relevant passages from the document when answering
- Provide structured, clear legal analysis
- Explain legal terms in plain language when asked
- Identify risks, obligations, parties, and key clauses
- Draft and review legal documents
- Always include a brief disclaimer that your responses are AI-assisted information, not professional legal advice

When document context is provided, ground answers about that document only in the supplied extracted text. If the requested fact is not present in the context, say: "That information is not found in the document." Do not invent names, dates, values, events, or evidence. Cite a page number when one is included in the context. You may provide general legal information only when the user explicitly asks for it, and clearly distinguish it from document facts.

Be conversational, thorough, and helpful like ChatGPT."""

def ask_llm(message: str, doc_context: str, doc_name: str, history: list) -> str:
    if not llm:
        return "⚠️ AI service not configured. Please set the GEMINI_API_KEY environment variable."

    messages = [SystemMessage(content=LEGAL_SYSTEM_PROMPT)]

    # Add document context
    if doc_context:
        ctx_msg = f"""The user has uploaded a legal document titled "{doc_name}".

Here are the most relevant sections from the document based on the user's question:

---
{doc_context}
---

Use only this extracted page text for claims about the document. If the answer is absent, say that the information is not found in the document. Do not infer or invent details. Quote relevant passages and cite the supplied page number where appropriate."""
        messages.append(SystemMessage(content=ctx_msg))

    # Add conversation history (last 6 turns)
    for h in history[-6:]:
        if h["role"] == "user":
            messages.append(HumanMessage(content=h["content"]))
        else:
            messages.append(AIMessage(content=h["content"]))

    messages.append(HumanMessage(content=message))

    try:
        response = llm.invoke(messages)
        return response.content
    except Exception as e:
        return f"⚠️ AI error: {str(e)[:200]}. Please try again."

# ═══════════════════════════════════════════════════════════════════════════════
# Document generation helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _nda(d):
    extra = ("6. ADDITIONAL TERMS\n" + d['key_terms'] + "\n") if d.get('key_terms') else ""
    return (
        "NON-DISCLOSURE AGREEMENT\n\n"
        f"This Non-Disclosure Agreement (\"Agreement\") is entered into as of {d['date']} "
        f"between {d['client_name']} (\"Disclosing Party\") and {d['opposite_name']} (\"Receiving Party\").\n\n"
        f"1. PURPOSE\nThe parties wish to explore a potential business relationship regarding: {d['purpose']}\n\n"
        "2. CONFIDENTIAL INFORMATION\n\"Confidential Information\" means any non-public information disclosed by either party.\n\n"
        "3. OBLIGATIONS\nThe Receiving Party agrees to:\n"
        "(a) Keep the Confidential Information strictly confidential;\n"
        "(b) Not disclose it to any third party without prior written consent;\n"
        "(c) Use it solely for the Purpose described above.\n\n"
        "4. TERM\nThis Agreement shall remain effective for two (2) years from the date hereof.\n\n"
        f"5. GOVERNING LAW\nThis Agreement shall be governed by the laws of {d['jurisdiction']}.\n\n"
        f"{extra}\n"
        "IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.\n\n"
        f"{d['client_name']}                    {d['opposite_name']}\n"
        f"Address: {d['address']}\n\n"
        "____________________              ____________________\n"
        "Signature                         Signature\n"
        "Date:                             Date:\n\n"
        "This document was generated by LegalGPT AI. Please review with a qualified attorney before use."
    )

def _rental(d):
    extra = ("ADDITIONAL TERMS:\n" + d['key_terms'] + "\n") if d.get('key_terms') else ""
    return (
        "RENTAL AGREEMENT\n\n"
        f"This Rental Agreement is entered into on {d['date']} between {d['client_name']} (\"Landlord\") and {d['opposite_name']} (\"Tenant\").\n\n"
        f"PROPERTY: {d['address']}\n"
        f"PURPOSE: {d['purpose']}\n"
        f"GOVERNING LAW: {d['jurisdiction']}\n\n"
        f"{extra}\n"
        f"Landlord: {d['client_name']}\n"
        f"Tenant: {d['opposite_name']}\n\n"
        "____________________              ____________________\n"
        "Signature                         Signature\n\n"
        "This document was generated by LegalGPT AI. Please review with a qualified attorney before use."
    )

def _employment(d):
    extra = ("4. ADDITIONAL TERMS:\n" + d['key_terms'] + "\n") if d.get('key_terms') else ""
    return (
        "EMPLOYMENT AGREEMENT\n\n"
        f"This Employment Agreement is entered into on {d['date']} between {d['client_name']} (\"Employer\") and {d['opposite_name']} (\"Employee\").\n\n"
        f"1. POSITION: {d['purpose']}\n"
        f"2. PLACE OF WORK: {d['address']}\n"
        f"3. GOVERNING LAW: {d['jurisdiction']}\n\n"
        f"{extra}\n"
        f"Employer: {d['client_name']}\n"
        f"Employee: {d['opposite_name']}\n\n"
        "____________________              ____________________\n"
        "Signature                         Signature\n\n"
        "This document was generated by LegalGPT AI. Please review with a qualified attorney before use."
    )

def _legal_notice(d):
    body = d.get('key_terms') or 'You are hereby requested to take immediate action as required by law.'
    return (
        "LEGAL NOTICE\n\n"
        f"Date: {d['date']}\n\n"
        f"TO: {d['opposite_name']}\n"
        f"Address: {d['address']}\n\n"
        f"FROM: {d['client_name']}\n\n"
        "SUBJECT: Legal Notice\n\n"
        "Dear Sir/Madam,\n\n"
        f"This legal notice is being sent to you regarding: {d['purpose']}\n\n"
        f"{body}\n\n"
        "If you fail to comply within the stipulated period, appropriate legal action shall be taken without further notice.\n\n"
        f"Jurisdiction: {d['jurisdiction']}\n\n"
        f"Yours sincerely,\n{d['client_name']}\n\n"
        "This document was generated by LegalGPT AI. Please review with a qualified attorney before use."
    )

TEMPLATES = {
    "nda": _nda,
    "rental_agreement": _rental,
    "employment_agreement": _employment,
    "legal_notice": _legal_notice,
}

TITLES = {
    "nda": "Non-Disclosure Agreement",
    "rental_agreement": "Rental Agreement",
    "employment_agreement": "Employment Agreement",
    "service_agreement": "Service Agreement",
    "legal_notice": "Legal Notice",
    "formal_complaint": "Formal Complaint Letter",
    "authorization_letter": "Authorization Letter",
}

def generate_content_text(doc_type: str, data: dict) -> str:
    fn = TEMPLATES.get(doc_type)
    if fn:
        return fn(data)
    key_terms_section = ("Key Terms:\n" + data['key_terms'] + "\n") if data.get('key_terms') else ""
    title_line = doc_type.upper().replace('_', ' ')
    return (
        f"{title_line}\n\n"
        f"Date: {data['date']}\n"
        f"Between: {data['client_name']} and {data['opposite_name']}\n"
        f"Address: {data['address']}\n"
        f"Purpose: {data['purpose']}\n"
        f"Jurisdiction: {data['jurisdiction']}\n\n"
        f"{key_terms_section}\n"
        "This document was generated by LegalGPT AI. Please review with a qualified attorney before use."
    )

def get_title(doc_type: str, client_name: str) -> str:
    base = TITLES.get(doc_type, doc_type.replace("_", " ").title())
    return f"{base} - {client_name}"

def build_pdf(title: str, content: str) -> bytes:
    """Generate a PDF from text using ReportLab."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            rightMargin=inch, leftMargin=inch,
                            topMargin=inch, bottomMargin=inch)
    styles = getSampleStyleSheet()

    header_style = ParagraphStyle("Header",
        parent=styles["Heading1"],
        fontSize=16,
        textColor=colors.HexColor("#1a1a2e"),
        spaceAfter=12,
        fontName="Helvetica-Bold")

    body_style = ParagraphStyle("Body",
        parent=styles["Normal"],
        fontSize=11,
        leading=16,
        spaceAfter=8)

    footer_style = ParagraphStyle("Footer",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.grey,
        spaceAfter=4)

    story = [
        Paragraph("LegalGPT", ParagraphStyle("Brand",
            parent=styles["Normal"],
            fontSize=10,
            textColor=colors.HexColor("#b8860b"),
            spaceAfter=4)),
        Paragraph(title, header_style),
        Spacer(1, 0.2 * inch),
    ]

    for line in content.split("\n"):
        line = line.strip()
        if not line:
            story.append(Spacer(1, 0.1 * inch))
        elif line.isupper() and len(line) < 80:
            story.append(Paragraph(line, ParagraphStyle("Section",
                parent=styles["Normal"],
                fontSize=12,
                fontName="Helvetica-Bold",
                spaceAfter=6,
                textColor=colors.HexColor("#1a1a2e"))))
        else:
            safe = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Paragraph(safe, body_style))

    story.append(Spacer(1, 0.3 * inch))
    story.append(Paragraph(
        f"Generated by LegalGPT AI · {datetime.datetime.utcnow().strftime('%Y-%m-%d')}",
        footer_style))

    doc.build(story)
    return buf.getvalue()

# ═══════════════════════════════════════════════════════════════════════════════
# Email helper (Resend)
# ═══════════════════════════════════════════════════════════════════════════════

MAX_EMAIL_ATTACHMENT_BYTES = 5 * 1024 * 1024
MAX_EMAIL_REQUEST_BYTES = 8 * 1024 * 1024
EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)


class EmailConfigurationError(Exception):
    pass


class EmailProviderError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def is_valid_email(value: str) -> bool:
    if not isinstance(value, str) or len(value) > 254 or value.count("@") != 1:
        return False
    local_part, domain = value.rsplit("@", 1)
    return (
        0 < len(local_part) <= 64
        and not local_part.startswith(".")
        and not local_part.endswith(".")
        and ".." not in local_part
        and len(domain) <= 253
        and bool(EMAIL_PATTERN.fullmatch(value))
    )


def validate_email_attachment(attachment: dict) -> dict:
    if not isinstance(attachment, dict):
        raise ValueError("Choose a valid PDF, DOCX, or TXT attachment.")

    raw_filename = attachment.get("filename")
    raw_content_type = attachment.get("contentType")
    encoded_content = attachment.get("contentBase64")
    if not all(isinstance(value, str) and value.strip() for value in (
        raw_filename, raw_content_type, encoded_content,
    )):
        raise ValueError("The attachment is incomplete.")

    if len(encoded_content) > 7_000_000:
        raise OverflowError("Attachments must be 5 MB or smaller.")
    try:
        file_bytes = base64.b64decode(encoded_content, validate=True)
    except (ValueError, TypeError):
        raise ValueError("The attachment could not be read. Please choose it again.")
    if not file_bytes:
        raise ValueError("The attachment is empty.")
    if len(file_bytes) > MAX_EMAIL_ATTACHMENT_BYTES:
        raise OverflowError("Attachments must be 5 MB or smaller.")

    filename = secure_filename(raw_filename.replace("\\", "/").rsplit("/", 1)[-1])
    extension = os.path.splitext(filename)[1].lower()
    allowed_types = {
        ".pdf": {"application/pdf", "application/octet-stream"},
        ".docx": {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/octet-stream",
            "application/zip",
        },
        ".txt": {"text/plain", "application/octet-stream"},
    }
    if extension not in allowed_types:
        raise ValueError("Only PDF, DOCX, or TXT attachments are allowed.")
    content_type = raw_content_type.split(";", 1)[0].strip().lower()
    if content_type not in allowed_types[extension]:
        raise ValueError("The attachment type does not match its file extension.")

    if extension == ".pdf":
        if not file_bytes.startswith(b"%PDF-"):
            raise ValueError("This file is not a valid PDF.")
    elif extension == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
                entries = archive.infolist()
                names = {entry.filename for entry in entries}
                if (
                    len(entries) > 1000
                    or sum(entry.file_size for entry in entries) > 20 * 1024 * 1024
                    or "[Content_Types].xml" not in names
                    or "word/document.xml" not in names
                    or any(name.lower().endswith("vbaproject.bin") for name in names)
                ):
                    raise ValueError("This file is not a supported DOCX document.")
        except (zipfile.BadZipFile, OSError):
            raise ValueError("This file is not a valid DOCX document.")
    else:
        try:
            decoded_text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raise ValueError("Text attachments must use UTF-8 encoding.")
        if "\x00" in decoded_text:
            raise ValueError("This file is not a valid text document.")

    return {
        "filename": filename or "attachment" + extension,
        "content": base64.b64encode(file_bytes).decode("ascii"),
    }


def send_email_resend(
    to: str,
    subject: str,
    body: str,
    attachments: list[dict],
    html_body: str | None = None,
) -> str | None:
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    sender_email = os.environ.get("RESEND_FROM_EMAIL", "").strip()
    sender_name = os.environ.get("RESEND_FROM_NAME", "").strip()
    if not api_key:
        raise EmailConfigurationError("Email service is not configured. Please contact the administrator.")
    if (
        not sender_email
        or not is_valid_email(sender_email)
        or "\r" in sender_email
        or "\n" in sender_email
    ):
        raise EmailConfigurationError("Website email sender is not configured.")
    if (
        not sender_name
        or len(sender_name) > 100
        or "\r" in sender_name
        or "\n" in sender_name
        or any(ord(character) < 32 for character in sender_name)
    ):
        raise EmailConfigurationError("Website email sender name is not configured.")

    payload = {
        "from": formataddr((sender_name, sender_email)),
        "to": [to],
        "subject": subject,
        "text": body,
    }
    if html_body:
        payload["html"] = html_body
    if attachments:
        payload["attachments"] = attachments

    req = Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "LegalGPT/1.0",
        },
    )
    try:
        with urlopen(req, timeout=20) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        app.logger.warning("Resend rejected email request with HTTP %s", exc.code)
        raise EmailProviderError("The email provider rejected the message.", 502)
    except (URLError, SocketTimeout, TimeoutError, OSError) as exc:
        app.logger.warning("Resend email request failed: %s", type(exc).__name__)
        raise EmailProviderError("The email provider did not respond in time.", 504)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise EmailProviderError("The email provider returned an invalid response.", 502)

    return response_data.get("id") if isinstance(response_data, dict) else None

# ═══════════════════════════════════════════════════════════════════════════════
# Routes — Auth
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/auth/signup", methods=["POST"])
def signup():
    data = request.get_json() or {}
    name, email, password = data.get("name"), data.get("email"), data.get("password")
    if not all([name, email, password]):
        return jsonify({"error": "Name, email and password are required"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 400
    user = User(name=name, email=email, password_hash=hash_password(password), role="user")
    db.session.add(user)
    db.session.commit()
    token = generate_token(user.id)
    return jsonify({
        "user": {"id": user.id, "name": user.name, "email": user.email,
                 "role": user.role, "createdAt": user.created_at.isoformat()},
        "token": token,
    }), 201

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email, password = data.get("email"), data.get("password")
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    user = User.query.filter_by(email=email).first()
    if not user or user.password_hash != hash_password(password):
        return jsonify({"error": "Invalid email or password"}), 401
    token = generate_token(user.id)
    return jsonify({
        "user": {"id": user.id, "name": user.name, "email": user.email,
                 "role": user.role, "createdAt": user.created_at.isoformat()},
        "token": token,
    })

@app.route("/api/auth/logout", methods=["POST"])
def logout():
    return jsonify({"success": True, "message": "Logged out successfully"})

@app.route("/api/auth/me", methods=["GET"])
@require_auth
def me():
    u = g.user
    return jsonify({"id": u.id, "name": u.name, "email": u.email,
                    "role": u.role, "createdAt": u.created_at.isoformat()})

# ═══════════════════════════════════════════════════════════════════════════════
# Routes — Documents
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/documents", methods=["GET"])
@require_auth
def list_documents():
    docs = Document.query.filter_by(user_id=g.user.id).all()
    return jsonify([{
        "id": d.id, "name": d.name, "size": d.size, "type": d.type,
        "status": d.status, "uploadDate": d.upload_date.isoformat(),
        "userId": d.user_id, "summary": d.summary,
    } for d in docs])

@app.route("/api/documents", methods=["POST"])
@require_auth
def upload_document():
    if request.content_length and request.content_length > MAX_DOCUMENT_REQUEST_BYTES:
        return jsonify({"error": "Documents must be 50 MB or smaller."}), 413

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Choose a PDF, DOCX, or TXT document to upload."}), 400

    name, size, ftype = data.get("name"), data.get("size"), data.get("type")
    if not isinstance(name, str) or not name.strip() or not isinstance(size, int) or isinstance(size, bool) or size < 0:
        return jsonify({"error": "A document name and valid file size are required."}), 400
    if not isinstance(ftype, str) or not ftype.strip():
        return jsonify({"error": "Name, size and type are required"}), 400

    source_filename = data.get("filename")
    source_filename = source_filename.strip() if isinstance(source_filename, str) else ""
    if not source_filename:
        source_filename = name.strip()
    extension = os.path.splitext(source_filename.lower())[1]
    mime_extensions = {
        "application/pdf": ".pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/zip": ".docx",
        "text/plain": ".txt",
    }
    if extension not in {".pdf", ".docx", ".txt"}:
        extension = mime_extensions.get(ftype.split(";", 1)[0].strip().lower(), "")
        if extension:
            source_filename = source_filename + extension
    allowed_types = {
        ".pdf": {"application/pdf", "application/octet-stream"},
        ".docx": {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/zip",
            "application/octet-stream",
        },
        ".txt": {"text/plain", "application/octet-stream"},
    }
    actual_type = ftype.split(";", 1)[0].strip().lower()
    if extension not in allowed_types or actual_type not in allowed_types[extension]:
        return jsonify({"error": "Only matching PDF, DOCX, or TXT files are supported."}), 400

    encoded_file = data.get("fileBase64")
    if isinstance(encoded_file, str):
        if len(encoded_file) > 70_000_000:
            return jsonify({"error": "Documents must be 50 MB or smaller."}), 413
        try:
            file_bytes = base64.b64decode(encoded_file, validate=True)
        except (ValueError, TypeError):
            return jsonify({"error": "The document could not be read. Please choose it again."}), 400
        if len(file_bytes) > MAX_DOCUMENT_UPLOAD_BYTES:
            return jsonify({"error": "Documents must be 50 MB or smaller."}), 413
        if len(file_bytes) != size:
            return jsonify({"error": "The uploaded document size did not match the selected file."}), 400
        if not file_bytes:
            return jsonify({"error": "The selected document is empty."}), 400
        if extension == ".pdf" and not file_bytes.startswith(b"%PDF-"):
            return jsonify({"error": "This file is not a valid PDF."}), 400
        try:
            content = extract_document_text(source_filename, file_bytes)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 422
        except RuntimeError:
            app.logger.exception("PDF text extraction is not available")
            return jsonify({"error": "PDF text extraction is unavailable. Please contact the administrator."}), 500
    else:
        # Compatibility for older clients that already submit extracted text.
        legacy_content = data.get("content")
        if not isinstance(legacy_content, str) or not legacy_content.strip():
            return jsonify({"error": "The document contains no readable text. Please upload the original file."}), 400
        content = clean_extracted_text(legacy_content)
        if extension == ".pdf" and looks_like_pdf_structure(content):
            return jsonify({
                "error": "This PDF was sent as raw file data instead of readable page text. Please re-upload the original PDF."
            }), 422
        if len(content) < 10:
            return jsonify({"error": "No readable text was found in this document."}), 422

    doc = Document(name=name.strip()[:500], size=size, type=actual_type, content=content,
                   status="processed", user_id=g.user.id)
    db.session.add(doc)
    db.session.commit()

    # Index into ChromaDB for RAG
    if content:
        index_document(doc.id, content)

    log_action("document_upload", g.user.id, f"Uploaded: {name}")
    return jsonify({
        "id": doc.id, "name": doc.name, "size": doc.size, "type": doc.type,
        "status": doc.status, "uploadDate": doc.upload_date.isoformat(),
        "userId": doc.user_id, "summary": doc.summary,
    }), 201

@app.route("/api/documents/<int:doc_id>", methods=["GET"])
@require_auth
def get_document(doc_id):
    doc = Document.query.filter_by(id=doc_id, user_id=g.user.id).first_or_404()
    return jsonify({
        "id": doc.id, "name": doc.name, "size": doc.size, "type": doc.type,
        "status": doc.status, "uploadDate": doc.upload_date.isoformat(),
        "userId": doc.user_id, "summary": doc.summary, "content": doc.content,
    })

@app.route("/api/documents/<int:doc_id>", methods=["DELETE"])
@require_auth
def delete_document(doc_id):
    doc = Document.query.filter_by(id=doc_id, user_id=g.user.id).first_or_404()
    # Remove from ChromaDB
    try:
        existing = chroma_collection.get(where={"doc_id": str(doc_id)})
        if existing["ids"]:
            chroma_collection.delete(ids=existing["ids"])
    except Exception:
        pass
    db.session.delete(doc)
    db.session.commit()
    log_action("document_delete", g.user.id, f"Deleted: {doc.name}")
    return jsonify({"success": True})

# ═══════════════════════════════════════════════════════════════════════════════
# Routes — AI Chat (LangChain + Gemini + ChromaDB RAG)
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/chat", methods=["POST"])
@require_auth
def chat():
    data = request.get_json() or {}
    message     = data.get("message", "").strip()
    document_id = data.get("documentId")
    session_id  = data.get("sessionId") or secrets.token_hex(8)

    if not message:
        return jsonify({"error": "Message is required"}), 400
    if document_id is not None and (
        isinstance(document_id, bool) or not isinstance(document_id, int) or document_id < 1
    ):
        return jsonify({"error": "Choose a valid document."}), 400

    doc = None
    if document_id is not None:
        doc = Document.query.filter_by(id=document_id, user_id=g.user.id).first()
        if not doc:
            return jsonify({"error": "The selected document could not be found in your account."}), 404

    # Save user message
    user_msg = ChatHistory(role="user", content=message, document_id=document_id,
                           session_id=session_id, user_id=g.user.id)
    db.session.add(user_msg)
    db.session.commit()

    # Load conversation history for context
    history_rows = ChatHistory.query.filter_by(
        user_id=g.user.id, session_id=session_id
    ).order_by(ChatHistory.created_at).all()
    history = [{"role": r.role, "content": r.content} for r in history_rows[:-1]]  # exclude the one just added

    # RAG: retrieve relevant context from ChromaDB
    doc_name    = "the document"
    doc_context = ""
    legacy_pdf_needs_reupload = False
    if doc:
        doc_name = doc.name
        legacy_pdf_needs_reupload = (
            doc.type == "application/pdf" and looks_like_pdf_structure(doc.content or "")
        )
        if not legacy_pdf_needs_reupload:
            doc_context = retrieve_context(document_id, message)
            if not doc_context and doc.content:
                doc_context = doc.content[:12000]

    # Call LangChain + Gemini
    if legacy_pdf_needs_reupload:
        ai_content = (
            "This older PDF was stored before readable page text was extracted, so I can't safely analyze it. "
            "Please delete it and re-upload the original PDF."
        )
    else:
        ai_content = ask_llm(message, doc_context, doc_name, history)

    sources = json.dumps([{"document": doc_name, "rag": bool(doc_context)}]) if document_id else None

    ai_msg = ChatHistory(role="assistant", content=ai_content, document_id=document_id,
                         session_id=session_id, sources=sources, user_id=g.user.id)
    db.session.add(ai_msg)
    db.session.commit()

    log_action("ai_query", g.user.id, f'AI chat on "{doc_name}": {message[:80]}')

    return jsonify({
        "id": ai_msg.id, "role": ai_msg.role, "content": ai_msg.content,
        "sources": ai_msg.sources, "createdAt": ai_msg.created_at.isoformat(),
    })

@app.route("/api/chat/history", methods=["GET"])
@require_auth
def chat_history():
    msgs = ChatHistory.query.filter_by(user_id=g.user.id).order_by(ChatHistory.created_at).all()
    return jsonify([{
        "id": m.id, "role": m.role, "content": m.content,
        "documentId": m.document_id, "sessionId": m.session_id,
        "sources": m.sources, "createdAt": m.created_at.isoformat(),
    } for m in msgs])

# ═══════════════════════════════════════════════════════════════════════════════
# Routes — Document Generation + PDF (ReportLab)
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/generate-document", methods=["POST"])
@require_auth
def generate_document():
    data = request.get_json() or {}
    required = ["documentType", "clientName", "oppositeName", "address", "purpose", "date", "jurisdiction"]
    if not all(data.get(k) for k in required):
        return jsonify({"error": "All required fields must be provided"}), 400

    d = {
        "document_type": data["documentType"],
        "client_name":   data["clientName"],
        "opposite_name": data["oppositeName"],
        "address":       data["address"],
        "purpose":       data["purpose"],
        "date":          data["date"],
        "jurisdiction":  data["jurisdiction"],
        "key_terms":     data.get("keyTerms", ""),
    }

    content = generate_content_text(d["document_type"], d)
    title   = get_title(d["document_type"], d["client_name"])

    draft = GeneratedDraft(
        document_type=d["document_type"], title=title, content=content,
        client_name=d["client_name"], opposite_name=d["opposite_name"],
        address=d["address"], purpose=d["purpose"], jurisdiction=d["jurisdiction"],
        user_id=g.user.id,
    )
    db.session.add(draft)
    db.session.commit()

    log_action("document_generated", g.user.id, f"Generated: {title}")

    return jsonify({
        "id": draft.id, "documentType": draft.document_type, "title": draft.title,
        "content": draft.content, "clientName": draft.client_name,
        "oppositeName": draft.opposite_name, "createdAt": draft.created_at.isoformat(),
        "userId": draft.user_id,
    })

@app.route("/api/drafts", methods=["GET"])
@require_auth
def list_drafts():
    drafts = GeneratedDraft.query.filter_by(user_id=g.user.id).all()
    return jsonify([{
        "id": d.id, "documentType": d.document_type, "title": d.title,
        "content": d.content, "clientName": d.client_name,
        "oppositeName": d.opposite_name, "createdAt": d.created_at.isoformat(),
        "userId": d.user_id,
    } for d in drafts])

@app.route("/api/drafts/<int:draft_id>", methods=["GET"])
@require_auth
def get_draft(draft_id):
    draft = GeneratedDraft.query.filter_by(id=draft_id, user_id=g.user.id).first_or_404()
    return jsonify({
        "id": draft.id, "documentType": draft.document_type, "title": draft.title,
        "content": draft.content, "clientName": draft.client_name,
        "oppositeName": draft.opposite_name, "createdAt": draft.created_at.isoformat(),
        "userId": draft.user_id,
    })

@app.route("/api/drafts/<int:draft_id>", methods=["DELETE"])
@require_auth
def delete_draft(draft_id):
    draft = GeneratedDraft.query.filter_by(id=draft_id, user_id=g.user.id).first_or_404()
    db.session.delete(draft)
    db.session.commit()
    return jsonify({"success": True})

@app.route("/api/drafts/<int:draft_id>/pdf", methods=["GET"])
@require_auth
def download_pdf(draft_id):
    from flask import Response
    draft = GeneratedDraft.query.filter_by(id=draft_id, user_id=g.user.id).first_or_404()
    pdf_bytes = build_pdf(draft.title, draft.content)
    filename = draft.title.replace(" ", "_").replace("/", "-")[:80] + ".pdf"
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

# ═══════════════════════════════════════════════════════════════════════════════
# Routes — Email (Resend)
# ═══════════════════════════════════════════════════════════════════════════════

def log_email_attempt(user_id: int, status: str, recipient: str, subject: str, detail: str = ""):
    audit = {
        "status": status,
        "recipient": (recipient or "")[:254],
        "subject": (subject or "")[:500],
    }
    if detail:
        audit["detail"] = detail[:300]
    log_action(
        "email_sent" if status == "sent" else "email_failed",
        user_id,
        json.dumps(audit, ensure_ascii=False),
    )


def build_email_bodies(sender_name: str, sender_email: str, message: str, has_attachment: bool):
    plain_parts = [
        "AI LEGAL",
        "",
        "Sender Details",
        "",
        f"Name: {sender_name}",
        f"Email: {sender_email}",
        "",
        "Message",
        "",
        message,
    ]
    if has_attachment:
        plain_parts.extend(["", "Attachment", "", "The requested legal document is attached to this email."])
    text_body = "\n".join(plain_parts)

    safe_name = html.escape(sender_name, quote=True)
    safe_email = html.escape(sender_email, quote=True)
    safe_message = html.escape(message, quote=True).replace("\n", "<br>\n")
    attachment_html = (
        '<section style="margin-top:24px;padding:16px;background:#f5f7fa;border-radius:8px">'
        '<strong>Attachment</strong><p style="margin:8px 0 0">The requested legal document is attached to this email.</p></section>'
        if has_attachment else ""
    )
    html_body = (
        '<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#172033">'
        '<main style="max-width:640px;margin:32px auto;background:#fff;border:1px solid #e4e8ef;border-radius:12px;overflow:hidden">'
        '<header style="padding:24px 32px;background:#101828;color:#fff;font-size:20px;font-weight:700;letter-spacing:.08em">AI LEGAL</header>'
        '<div style="padding:28px 32px">'
        '<h2 style="margin:0 0 16px;font-size:18px">Sender Details</h2>'
        f'<p style="margin:6px 0"><strong>Name:</strong> {safe_name}</p>'
        f'<p style="margin:6px 0"><strong>Email:</strong> {safe_email}</p>'
        '<hr style="border:0;border-top:1px solid #e4e8ef;margin:24px 0">'
        '<h2 style="margin:0 0 12px;font-size:18px">Message</h2>'
        f'<div style="line-height:1.65;white-space:normal">{safe_message}</div>'
        f'{attachment_html}'
        '</div><footer style="padding:16px 32px;background:#f8fafc;color:#667085;font-size:12px">'
        'Sent securely from the AI Legal website.</footer></main></body></html>'
    )
    return text_body, html_body


@app.route("/api/send-email", methods=["POST"])
@require_auth
def send_email():
    if request.content_length and request.content_length > MAX_EMAIL_REQUEST_BYTES:
        log_email_attempt(g.user.id, "failed", "", "", "Request exceeds the 8 MB limit")
        return jsonify({"error": "The email attachment is too large. The maximum request size is 8 MB."}), 413

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        log_email_attempt(g.user.id, "failed", "", "", "Invalid JSON request")
        return jsonify({"error": "Please enter a recipient, sender details, subject, and message."}), 400

    def input_value(primary, *legacy):
        for key in (primary, *legacy):
            if key in data and data[key] is not None:
                return data[key]
        return ""

    recipient_value = input_value("to", "recipientEmail")
    sender_name_value = input_value("sender_name", "senderName")
    sender_email_value = input_value("sender_email", "senderEmail")
    subject_value = input_value("subject")
    body_value = input_value("message", "body")
    recipient = recipient_value.strip() if isinstance(recipient_value, str) else ""
    sender_name = sender_name_value.strip() if isinstance(sender_name_value, str) else ""
    sender_email = sender_email_value.strip() if isinstance(sender_email_value, str) else ""
    subject = subject_value.strip() if isinstance(subject_value, str) else ""
    body = body_value.strip() if isinstance(body_value, str) else ""

    if not is_valid_email(recipient):
        log_email_attempt(g.user.id, "failed", recipient, subject, "Invalid recipient address")
        return jsonify({"error": "Please enter a valid recipient email address."}), 400
    if not sender_name or len(sender_name) > 200 or any(ord(character) < 32 for character in sender_name):
        log_email_attempt(g.user.id, "failed", recipient, subject, "Invalid sender name")
        return jsonify({"error": "Please enter a valid sender name."}), 400
    if not is_valid_email(sender_email):
        log_email_attempt(g.user.id, "failed", recipient, subject, "Invalid sender email address")
        return jsonify({"error": "Please enter a valid sender email address."}), 400
    if not subject:
        log_email_attempt(g.user.id, "failed", recipient, subject, "Missing subject")
        return jsonify({"error": "Please enter an email subject."}), 400
    if len(subject) > 500 or "\r" in subject or "\n" in subject:
        log_email_attempt(g.user.id, "failed", recipient, subject, "Invalid subject")
        return jsonify({"error": "The subject must be 500 characters or fewer and cannot contain line breaks."}), 400
    if not body:
        log_email_attempt(g.user.id, "failed", recipient, subject, "Missing message")
        return jsonify({"error": "Please enter a message."}), 400
    if len(body) > 100000:
        log_email_attempt(g.user.id, "failed", recipient, subject, "Message exceeds the size limit")
        return jsonify({"error": "The message is too long. Keep it under 100,000 characters."}), 400

    draft_id = input_value("document_id", "documentId", "draftId") or None
    if isinstance(draft_id, str) and draft_id.isdigit():
        draft_id = int(draft_id)
    if draft_id is not None and (
        isinstance(draft_id, bool) or not isinstance(draft_id, int) or draft_id < 1
    ):
        log_email_attempt(g.user.id, "failed", recipient, subject, "Invalid generated document ID")
        return jsonify({"error": "Choose a valid generated document."}), 400

    attachments = []
    attachment = data.get("attachment")
    if attachment is not None:
        try:
            attachments.append(validate_email_attachment(attachment))
        except OverflowError as exc:
            log_email_attempt(g.user.id, "failed", recipient, subject, str(exc))
            return jsonify({"error": str(exc)}), 413
        except ValueError as exc:
            log_email_attempt(g.user.id, "failed", recipient, subject, str(exc))
            return jsonify({"error": str(exc)}), 400

    if draft_id is not None:
        draft = GeneratedDraft.query.filter_by(id=draft_id, user_id=g.user.id).first()
        if not draft:
            log_email_attempt(g.user.id, "failed", recipient, subject, "Generated document not found")
            return jsonify({"error": "The selected document could not be found."}), 404
        try:
            pdf_bytes = build_pdf(draft.title, draft.content)
        except Exception:
            app.logger.exception("Could not build generated-document email attachment")
            log_email_attempt(g.user.id, "failed", recipient, subject, "PDF generation failed")
            return jsonify({"error": "The generated document could not be prepared as a PDF."}), 500
        if len(pdf_bytes) > MAX_EMAIL_ATTACHMENT_BYTES:
            log_email_attempt(g.user.id, "failed", recipient, subject, "Generated PDF exceeds the 5 MB limit")
            return jsonify({"error": "The generated PDF is too large to attach (maximum 5 MB)."}), 413
        filename = secure_filename(draft.title) or "legal-document"
        attachments.insert(0, {
            "filename": f"{filename[:180]}.pdf",
            "content": base64.b64encode(pdf_bytes).decode("ascii"),
        })

    text_body, html_body = build_email_bodies(sender_name, sender_email, body, bool(attachments))
    email = SentEmail(
        recipient_email=recipient,
        sender_name=sender_name,
        sender_email=sender_email,
        subject=subject,
        body=body,
        draft_id=draft_id,
        status="pending",
        user_id=g.user.id,
    )
    db.session.add(email)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        app.logger.exception("Could not record pending email attempt")
        log_email_attempt(g.user.id, "failed", recipient, subject, "Email audit record could not be saved")
        return jsonify({"error": "The email could not be recorded. Please try again."}), 500

    try:
        email.resend_message_id = send_email_resend(recipient, subject, text_body, attachments, html_body)
    except EmailConfigurationError as exc:
        email.status = "failed"
        db.session.commit()
        log_email_attempt(g.user.id, "failed", recipient, subject, str(exc))
        return jsonify({"error": str(exc)}), 503
    except EmailProviderError as exc:
        email.status = "failed"
        db.session.commit()
        log_email_attempt(g.user.id, "failed", recipient, subject, str(exc))
        if exc.status_code == 504:
            return jsonify({"error": "Unable to send the email. Please try again."}), 504
        return jsonify({"error": "Unable to send the email. Please try again."}), 502

    email.status = "sent"
    email.sent_at = datetime.datetime.utcnow()
    db.session.commit()
    log_email_attempt(g.user.id, "sent", recipient, subject)

    return jsonify({
        "id": email.id,
        "recipientEmail": email.recipient_email,
        "senderName": email.sender_name,
        "senderEmail": email.sender_email,
        "subject": email.subject,
        "body": email.body,
        "draftId": email.draft_id,
        "documentId": email.draft_id,
        "sentAt": email.sent_at.isoformat(),
        "status": email.status,
        "resendMessageId": email.resend_message_id,
    })

@app.route("/api/emails", methods=["GET"])
@require_auth
def list_emails():
    emails = SentEmail.query.filter_by(user_id=g.user.id).all()
    return jsonify([{
        "id": e.id,
        "recipientEmail": e.recipient_email,
        "senderName": e.sender_name,
        "senderEmail": e.sender_email,
        "subject": e.subject,
        "body": e.body,
        "draftId": e.draft_id,
        "documentId": e.draft_id,
        "sentAt": e.sent_at.isoformat(),
        "status": e.status,
        "resendMessageId": e.resend_message_id,
    } for e in emails])

# ═══════════════════════════════════════════════════════════════════════════════
# Routes — History & Dashboard
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/history", methods=["GET"])
@require_auth
def history():
    uid = g.user.id
    docs   = Document.query.filter_by(user_id=uid).limit(5).all()
    chats  = ChatHistory.query.filter_by(user_id=uid, role="user").limit(5).all()
    drafts = GeneratedDraft.query.filter_by(user_id=uid).limit(5).all()
    emails = SentEmail.query.filter_by(user_id=uid).limit(5).all()

    items = (
        [{"id": d.id,        "type": "upload",   "description": f"Uploaded: {d.name}",                     "createdAt": d.upload_date.isoformat(),  "metadata": None} for d in docs]   +
        [{"id": c.id * 100,  "type": "chat",     "description": f"Asked: {c.content[:60]}...",              "createdAt": c.created_at.isoformat(),   "metadata": None} for c in chats]  +
        [{"id": d.id * 300,  "type": "generate", "description": f"Generated: {d.title}",                   "createdAt": d.created_at.isoformat(),   "metadata": None} for d in drafts] +
        [{"id": e.id * 400,  "type": "email",    "description": f"Sent email to: {e.recipient_email}",     "createdAt": e.sent_at.isoformat(),      "metadata": None} for e in emails]
    )
    items.sort(key=lambda x: x["createdAt"], reverse=True)
    return jsonify(items)

@app.route("/api/dashboard/summary", methods=["GET"])
@require_auth
def dashboard_summary():
    uid = g.user.id
    doc_count   = Document.query.filter_by(user_id=uid).count()
    chat_count  = ChatHistory.query.filter_by(user_id=uid).count()
    draft_count = GeneratedDraft.query.filter_by(user_id=uid).count()
    email_count = SentEmail.query.filter_by(user_id=uid, status="sent").count()

    recent_docs   = Document.query.filter_by(user_id=uid).limit(3).all()
    recent_chats  = ChatHistory.query.filter_by(user_id=uid, role="user").limit(3).all()
    recent_drafts = GeneratedDraft.query.filter_by(user_id=uid).limit(2).all()

    activity = sorted([
        *[{"id": d.id,       "type": "upload",   "description": f"Uploaded: {d.name}",        "createdAt": d.upload_date.isoformat(), "metadata": None} for d in recent_docs],
        *[{"id": c.id * 100, "type": "chat",     "description": f"Asked: {c.content[:50]}...", "createdAt": c.created_at.isoformat(),  "metadata": None} for c in recent_chats],
        *[{"id": d.id * 300, "type": "generate", "description": f"Generated: {d.title}",       "createdAt": d.created_at.isoformat(),  "metadata": None} for d in recent_drafts],
    ], key=lambda x: x["createdAt"], reverse=True)[:5]

    return jsonify({
        "uploadedDocuments": doc_count,
        "questionsAsked":    chat_count,
        "draftsGenerated":   draft_count,
        "advocatesFound":    12,
        "lettersSent":       email_count,
        "recentActivity":    activity,
    })

# ═══════════════════════════════════════════════════════════════════════════════
# Routes — Admin
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/admin/stats", methods=["GET"])
@require_auth
def admin_stats():
    logs = AdminLog.query.order_by(AdminLog.created_at.desc()).limit(20).all()
    return jsonify({
        "totalUsers":     User.query.count(),
        "totalDocuments": Document.query.count(),
        "totalQueries":   ChatHistory.query.count(),
        "generatedPdfs":  GeneratedDraft.query.count(),
        "sentEmails":     SentEmail.query.filter_by(status="sent").count(),
        "systemActivity": [{
            "id": l.id, "action": l.action, "userId": l.user_id,
            "details": l.details, "createdAt": l.created_at.isoformat(),
        } for l in logs],
    })

@app.route("/api/admin/users", methods=["GET"])
@require_auth
def admin_users():
    users = User.query.all()
    return jsonify([{
        "id": u.id, "name": u.name, "email": u.email,
        "role": u.role, "createdAt": u.created_at.isoformat(),
    } for u in users])

@app.route("/api/admin/logs", methods=["GET"])
@require_auth
def admin_logs():
    logs = AdminLog.query.order_by(AdminLog.created_at.desc()).all()
    return jsonify([{
        "id": l.id, "action": l.action, "userId": l.user_id,
        "details": l.details, "createdAt": l.created_at.isoformat(),
    } for l in logs])

@app.route("/api/admin/reindex", methods=["POST"])
@require_auth
def admin_reindex():
    """Re-index all documents into ChromaDB."""
    docs = Document.query.filter(Document.content.isnot(None)).all()
    count = 0
    for doc in docs:
        if doc.content:
            index_document(doc.id, doc.content)
            count += 1
    log_action("reindex_documents", g.user.id, f"Re-indexed {count} documents into ChromaDB")
    return jsonify({"success": True, "message": f"Re-indexed {count} documents into ChromaDB vector store."})

# ═══════════════════════════════════════════════════════════════════════════════
# Routes — Advocates (live OpenStreetMap search)
# ═══════════════════════════════════════════════════════════════════════════════

_nominatim_cache: dict[str, tuple[float, tuple[float, float]]] = {}
_nominatim_lock = threading.Lock()
_nominatim_last_request = 0.0
_overpass_cache: dict[tuple[float, float, int], tuple[float, list[dict]]] = {}


def _geocode_city(city: str) -> tuple[float, float] | None:
    global _nominatim_last_request
    cache_key = city.strip().casefold()
    cached = _nominatim_cache.get(cache_key)
    now = time.monotonic()
    if cached and now - cached[0] < 86400:
        return cached[1]

    params = urlencode({"q": city, "format": "json", "limit": 1})
    req = Request(
        f"https://nominatim.openstreetmap.org/search?{params}",
        headers={"User-Agent": "LegalGPT/1.0", "Accept-Language": "en"},
    )
    try:
        with _nominatim_lock:
            wait = 1.0 - (time.monotonic() - _nominatim_last_request)
            if wait > 0:
                time.sleep(wait)
            _nominatim_last_request = time.monotonic()
            with urlopen(req, timeout=12) as response:
                places = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        app.logger.warning("Location lookup failed: %s", type(exc).__name__)
        raise RuntimeError("Location lookup is temporarily unavailable") from exc

    if not places:
        return None
    coords = (float(places[0]["lat"]), float(places[0]["lon"]))
    _nominatim_cache[cache_key] = (time.monotonic(), coords)
    return coords


def _fetch_overpass(lat: float, lon: float, radius_meters: int) -> list[dict]:
    cache_key = (round(lat, 4), round(lon, 4), radius_meters)
    cached = _overpass_cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < 900:
        return cached[1]

    query = f"""[out:json][timeout:15];
(
  nwr["office"~"^(lawyer|law_firm|legal_office|legal|notary)$"](around:{radius_meters},{lat},{lon});
);
out center tags 100;"""
    payload = urlencode({"data": query}).encode()
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
    ]
    failures = []
    for endpoint in endpoints:
        req = Request(
            endpoint,
            data=payload,
            headers={
                "User-Agent": "LegalGPT/1.0",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        try:
            with urlopen(req, timeout=20) as response:
                result = json.loads(response.read().decode("utf-8"))
            elements = result.get("elements", [])
            _overpass_cache[cache_key] = (time.monotonic(), elements)
            return elements
        except Exception as exc:
            failures.append(type(exc).__name__)
            upstream_status = getattr(exc, "code", None)
            app.logger.warning(
                "Overpass endpoint failed (%s): %s",
                endpoint,
                f"HTTP {upstream_status}" if upstream_status else type(exc).__name__,
            )
    raise RuntimeError(", ".join(failures) or "No Overpass endpoint responded")


@app.route("/api/advocates/search", methods=["POST"])
@require_auth
def search_nearby_advocates():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "A search location is required"}), 400

    city = data.get("city")
    city = city.strip()[:200] if isinstance(city, str) else ""
    try:
        radius_meters = int(data.get("radiusMeters", 10000))
    except (TypeError, ValueError):
        return jsonify({"error": "Choose a supported search radius"}), 400
    if not 1000 <= radius_meters <= 50000:
        return jsonify({"error": "Search radius must be between 1 and 50 km"}), 400

    if data.get("lat") is not None or data.get("lon") is not None:
        try:
            lat = float(data["lat"])
            lon = float(data["lon"])
        except (KeyError, TypeError, ValueError):
            return jsonify({"error": "Both latitude and longitude are required"}), 400
        if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
            return jsonify({"error": "The coordinates are invalid"}), 400
        location_label = "Your Location"
    elif city:
        try:
            coords = _geocode_city(city)
        except RuntimeError:
            return jsonify({"error": "Location lookup is temporarily unavailable. Please try again shortly."}), 502
        if not coords:
            return jsonify({"error": "Location not found. Try a city or area name."}), 400
        lat, lon = coords
        location_label = city
    else:
        return jsonify({"error": "Enter a city or use your current location"}), 400

    try:
        elements = _fetch_overpass(lat, lon, radius_meters)
    except RuntimeError:
        return jsonify({"error": "Map search is temporarily busy. Please try again shortly."}), 502

    results = []
    for element in elements:
        tags = element.get("tags") or {}
        name = tags.get("name")
        center = element.get("center") or {}
        result_lat = element.get("lat", center.get("lat"))
        result_lon = element.get("lon", center.get("lon"))
        if not name or result_lat is None or result_lon is None:
            continue

        address_parts = [
            tags.get("addr:housenumber"),
            tags.get("addr:street"),
            tags.get("addr:suburb") or tags.get("addr:neighbourhood"),
            tags.get("addr:city") or tags.get("addr:town"),
            tags.get("addr:state"),
        ]
        address = ", ".join(part for part in address_parts if part) or "Address not available"
        office = tags.get("office")
        osm_type = (
            "Law Firm" if office == "law_firm"
            else "Notary" if office == "notary"
            else "Legal Office" if office in {"legal", "legal_office"}
            else "Lawyer"
        )
        specialization_text = " ".join(
            str(tags.get(key) or "")
            for key in ("specialization", "legal:specialization", "description", "name:en")
        ).lower()
        specialization = next(
            (
                label for keywords, label in (
                    (("civil",), "Civil Law"),
                    (("criminal", "defence", "defense"), "Criminal Law"),
                    (("corporate", "business", "commercial"), "Corporate / Business Law"),
                    (("family", "matrimonial", "custody"), "Family Law"),
                    (("property", "real estate", "land"), "Property / Real Estate Law"),
                    (("cyber", "technology", "internet", "digital"), "Cyber / IT Law"),
                    (("consumer",), "Consumer Law"),
                    (("employment", "labour", "labor", "workplace"), "Employment / Labour Law"),
                    (("tax", "taxation", "gst"), "Tax Law"),
                    (("immigration", "visa", "citizenship"), "Immigration Law"),
                    (("intellectual property", "patent", "trademark", "copyright"), "Intellectual Property"),
                    (("divorce", "alimony", "marital"), "Divorce / Matrimonial"),
                    (("banking", "finance", "financial"), "Banking & Finance Law"),
                    (("environmental", "environment", "green"), "Environmental Law"),
                    (("human rights", "civil liberties"), "Human Rights Law"),
                )
                if any(keyword in specialization_text or keyword in str(name).lower() for keyword in keywords)
            ),
            None,
        )
        results.append({
            "id": f"{element.get('type', 'osm')}/{element.get('id')}",
            "name": name,
            "address": address,
            "lat": float(result_lat),
            "lon": float(result_lon),
            "osmType": osm_type,
            "phone": tags.get("phone") or tags.get("contact:phone"),
            "website": tags.get("website") or tags.get("contact:website"),
            "openingHours": tags.get("opening_hours"),
            "detectedSpecialization": specialization,
        })

    return jsonify({
        "centerLat": lat,
        "centerLon": lon,
        "locationLabel": location_label,
        "results": results,
    })


@app.route("/api/advocates", methods=["GET"])
@require_auth
def advocates():
    # Search results come from /api/advocates/search.
    return jsonify([])

# ═══════════════════════════════════════════════════════════════════════════════
# Routes — Health
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/healthz", methods=["GET"])
def healthz():
    return jsonify({
        "status": "ok",
        "stack": "Flask + SQLAlchemy + ChromaDB + LangChain + Gemini",
        "llm": "gemini-2.5-flash via LangChain",
        "rag": "ChromaDB",
        "db": "SQLite",
    })

# ═══════════════════════════════════════════════════════════════════════════════
# Startup — create tables + seed admin
# ═══════════════════════════════════════════════════════════════════════════════

def seed_admin():
    if not User.query.filter_by(email="admin@legalgpt.com").first():
        admin = User(
            name="Admin",
            email="admin@legalgpt.com",
            password_hash=hash_password("admin123"),
            role="admin",
        )
        db.session.add(admin)
        db.session.commit()
        app.logger.info("Admin user seeded: admin@legalgpt.com / admin123")


def ensure_email_history_columns():
    """Add email audit fields to existing SQLite databases without dropping data."""
    additions = {
        "sender_name": "VARCHAR(200)",
        "sender_email": "VARCHAR(254)",
        "resend_message_id": "VARCHAR(200)",
    }
    with db.engine.begin() as connection:
        columns = {
            row[1] for row in connection.exec_driver_sql("PRAGMA table_info(sent_emails)").fetchall()
        }
        for column, column_type in additions.items():
            if column not in columns:
                connection.exec_driver_sql(
                    f'ALTER TABLE sent_emails ADD COLUMN "{column}" {column_type}'
                )


with app.app_context():
    db.create_all()
    ensure_email_history_columns()
    seed_admin()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
