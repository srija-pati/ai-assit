import { Router } from "express";
import { db } from "@workspace/db";
import { chatHistoryTable, adminLogsTable, documentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

// ─── Content-aware AI response builder ────────────────────────────────────────

function excerpts(content: string, keywords: string[], count = 3): string[] {
  const sentences = content
    .split(/[.!?;\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 40);
  
  const scored = sentences.map(s => {
    const sl = s.toLowerCase();
    const score = keywords.reduce((acc, kw) => acc + (sl.includes(kw) ? 1 : 0), 0);
    return { s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map(x => x.s).filter(s => s.length > 0);
}

function hasContent(c: string | null): c is string {
  return !!c && c.trim().length > 80;
}

function docHead(content: string, chars = 400): string {
  return content.replace(/\s+/g, " ").trim().substring(0, chars);
}

function buildResponse(message: string, docName: string, docContent: string | null): string {
  const lower = message.toLowerCase();
  const name = docName.replace(/\.[^/.]+$/, "");
  const disclaimer = "\n\n*This is AI-assisted legal information, not professional legal advice. Always consult a qualified attorney before acting on any legal matter.*";
  const hc = hasContent(docContent);
  const ct = hc ? docContent! : "";

  // ── SUMMARIZE ──────────────────────────────────────────────────────────────
  if (lower.includes("summar") || lower.includes("overview") || lower.includes("what is this")) {
    if (hc) {
      const head = docHead(ct, 500);
      const keyEx = excerpts(ct, ["agree", "party", "parties", "shall", "term", "condition", "oblig"], 2);
      return `**Summary of "${name}"**

Based on the document content I have analysed:

**Opening / Introduction:**
"${head}..."

**Key Provisions Identified:**
${keyEx.length > 0 ? keyEx.map((e, i) => `${i + 1}. "${e}"`).join("\n") : "• The document establishes rights, obligations, and conditions between the named parties."}

**Document Type:** ${inferDocType(docName)}
**Primary Purpose:** ${inferPurpose(docName)}

*The above is drawn from the actual document text you uploaded.*${disclaimer}`;
    }
    return `**Summary of "${name}"**

This document is a **${inferDocType(docName)}** — ${inferPurpose(docName).toLowerCase()}.

Key areas typically covered:
1. Identification of parties and their roles
2. Core obligations and deliverables
3. Term, duration, and termination conditions
4. Payment or consideration terms (if applicable)
5. Confidentiality, IP, and dispute resolution clauses

*Upload a text-readable version of the document for a content-specific summary.*${disclaimer}`;
  }

  // ── CLAUSES ────────────────────────────────────────────────────────────────
  if (lower.includes("clause") || lower.includes("provision") || lower.includes("section") || lower.includes("extract")) {
    if (hc) {
      const clauseEx = excerpts(ct, ["clause", "provision", "section", "shall", "must", "agree", "term"], 4);
      return `**Key Clauses Found in "${name}"**

I identified the following clauses from your document:

${clauseEx.length > 0
  ? clauseEx.map((e, i) => `**Clause ${i + 1}:**\n"${e}"`).join("\n\n")
  : `No clearly delimited clause text was parsed — the document may use a non-standard format.`}

**Standard clauses expected in a ${inferDocType(docName)}:**
- Parties & Recitals — defines who is bound
- Obligations — what each party must do
- Term & Termination — duration and exit conditions
- Confidentiality — information restrictions
- Governing Law — jurisdiction applicable

*Shown above are actual text excerpts from your uploaded document.*${disclaimer}`;
    }
    return `**Key Clauses in "${name}" (${inferDocType(docName)})**

Standard clauses to look for:
1. **Parties Clause** — full legal names and addresses of all parties
2. **Recitals / Whereas** — background context and purpose
3. **Consideration** — what each party gives and receives
4. **Term & Termination** — start date, duration, notice period
5. **Confidentiality** — non-disclosure obligations
6. **Liability Cap** — maximum damages each party can claim
7. **Force Majeure** — events excusing non-performance
8. **Governing Law** — which jurisdiction's law applies
9. **Dispute Resolution** — arbitration, mediation, or litigation
10. **Entire Agreement** — supersedes prior oral/written agreements${disclaimer}`;
  }

  // ── RISK ───────────────────────────────────────────────────────────────────
  if (lower.includes("risk") || lower.includes("danger") || lower.includes("concern") || lower.includes("problem") || lower.includes("issue")) {
    if (hc) {
      const riskEx = excerpts(ct, ["liable", "penalty", "indemnif", "forfeit", "breach", "terminat", "loss", "damages", "fine"], 3);
      return `**Risk Analysis for "${name}"**

${riskEx.length > 0
  ? `**Potentially risky provisions identified in your document:**\n\n${riskEx.map((e, i) => `⚠️ **Risk Point ${i + 1}:**\n"${e}"`).join("\n\n")}`
  : `No immediately obvious liability language was extracted from the text.`}

**Standard risk checklist for a ${inferDocType(docName)}:**

🔴 **High Priority:**
- Unlimited or uncapped liability provisions
- Automatic renewal without notice
- Unilateral right to amend terms

🟡 **Medium Priority:**
- Broad IP assignment (could transfer pre-existing IP)
- Non-compete scope and geography
- Late payment penalties and interest rates

🟢 **Lower Priority (still review):**
- Governing law inconvenient to you
- Notice method and address provisions

*Risk excerpts above are drawn from your actual document text.*${disclaimer}`;
    }
    return `**Risk Analysis for "${name}"**

**High Priority Risks to check:**
- Liability provisions — unlimited liability is a red flag
- Automatic renewal clauses — can bind you without active consent
- Broad IP assignment — may transfer pre-existing intellectual property

**Medium Priority:**
- Non-compete / non-solicitation — overly broad = unenforceable
- Payment terms and late fee provisions
- Unilateral amendment rights by one party

**Low Priority (still review):**
- Governing law and jurisdiction convenience
- Notice provisions and contact details${disclaimer}`;
  }

  // ── EXPLAIN / PLAIN LANGUAGE ───────────────────────────────────────────────
  if (lower.includes("explain") || lower.includes("simple") || lower.includes("layman") || lower.includes("plain") || lower.includes("meaning") || lower.includes("mean")) {
    if (hc) {
      const head = docHead(ct, 600);
      return `**Plain Language Explanation of "${name}"**

Here is what this document says in everyday language:

**What the document starts with:**
"${head}..."

**In simple terms, this document:**
- Is a **${inferDocType(docName)}** — ${inferPurpose(docName).toLowerCase()}
- Creates **legal obligations** — once signed, both parties must follow it
- **Failure to comply** can lead to penalties, damages, or legal action

**What you should check before signing:**
1. Are the party names and addresses accurate?
2. Is the term/duration what you agreed?
3. Are the payment amounts correct?
4. Is there an exit clause if things go wrong?
5. Which court or arbitrator handles disputes?

*The opening text above is taken directly from your uploaded document.*${disclaimer}`;
    }
    return `**Plain Language Explanation of "${name}"**

This is a **${inferDocType(docName)}** — ${inferPurpose(docName).toLowerCase()}.

In simple terms:
- **What it is:** A written agreement that creates legal obligations
- **What it does:** Sets out what each side must do, what they get, and what happens if something goes wrong
- **Why it matters:** Once signed, breaking the terms can lead to legal consequences
- **What to watch for:** Deadlines, payment amounts, liability, and how disputes are handled

Always ask a lawyer before signing if you are unsure about any provision.${disclaimer}`;
  }

  // ── NDA / CONFIDENTIALITY ─────────────────────────────────────────────────
  if (lower.includes("nda") || lower.includes("non-disclosure") || lower.includes("confidential")) {
    if (hc) {
      const confEx = excerpts(ct, ["confidential", "disclose", "secret", "proprietary", "non-disclosure"], 3);
      return `**NDA / Confidentiality Analysis for "${name}"**

${confEx.length > 0
  ? `**Confidentiality provisions found in your document:**\n\n${confEx.map((e, i) => `"${e}"`).join("\n\n")}`
  : "No explicit confidentiality language was extracted — the document may not contain NDA provisions."}

**NDA Checklist:**
- ☐ Definition of "Confidential Information" — is it too broad or vague?
- ☐ Duration — how long must confidentiality be maintained? (2–5 years typical)
- ☐ Permitted disclosures — exceptions (legal obligation, public domain)
- ☐ Return/destruction of information on termination
- ☐ Mutual vs one-sided obligations
- ☐ Remedies for breach (injunctive relief is common)${disclaimer}`;
    }
    return `**NDA / Confidentiality Analysis for "${name}"**

Key points in any NDA:
1. **Scope** — what counts as "Confidential Information"?
2. **Duration** — typical range is 2–5 years; indefinite is unusual
3. **Permitted Disclosures** — legally required disclosures are usually excepted
4. **Return of Information** — must confidential materials be returned or destroyed?
5. **Remedies** — injunctive relief is the standard remedy for breach
6. **Mutual or One-sided** — verify which party bears obligations${disclaimer}`;
  }

  // ── PARTIES ────────────────────────────────────────────────────────────────
  if (lower.includes("part") || lower.includes("who") || lower.includes("signator") || lower.includes("between")) {
    if (hc) {
      const partyEx = excerpts(ct, ["between", "party", "parties", "hereinafter", "referred to as", "employer", "employee", "lessor", "lessee", "buyer", "seller", "client", "vendor"], 3);
      return `**Parties Identified in "${name}"**

${partyEx.length > 0
  ? `**Party information found in your document:**\n\n${partyEx.map(e => `"${e}"`).join("\n\n")}`
  : "Party names were not clearly extracted from the document text."}

*For definitive party identification, refer to the recitals and signature block of the original document.*${disclaimer}`;
    }
    return `**Parties in "${name}"**

Based on the document type (${inferDocType(docName)}):
- **First Party**: Initiating party (Disclosing Party / Employer / Landlord / Service Provider)
- **Second Party**: Counterparty (Receiving Party / Employee / Tenant / Client)
- **Witnesses / Guarantors**: Any additional signatories

Refer to the recitals and signature block for the full legal names and addresses of all parties.${disclaimer}`;
  }

  // ── PAYMENT / FEES ─────────────────────────────────────────────────────────
  if (lower.includes("payment") || lower.includes("fee") || lower.includes("money") || lower.includes("amount") || lower.includes("price") || lower.includes("cost") || lower.includes("salary") || lower.includes("rent")) {
    if (hc) {
      const payEx = excerpts(ct, ["payment", "fee", "amount", "rupee", "dollar", "pay", "salary", "rent", "consideration", "sum"], 3);
      return `**Payment Terms in "${name}"**

${payEx.length > 0
  ? `**Financial provisions found in your document:**\n\n${payEx.map(e => `"${e}"`).join("\n\n")}`
  : "No specific payment amounts were extracted from the document text."}

**Payment checklist:**
- ☐ Exact amount and currency clearly stated
- ☐ Payment schedule and due dates
- ☐ Late payment interest / penalty clause
- ☐ Accepted payment methods
- ☐ Tax responsibilities (GST, TDS, etc.)
- ☐ Refund conditions (if any)${disclaimer}`;
    }
    return `**Payment Terms in "${name}"**

Key payment provisions to verify:
1. **Amount** — exact figure and currency
2. **Schedule** — due date(s) and installments
3. **Late Payment** — interest/penalty (commonly 1.5–2% per month)
4. **Method** — bank transfer, cheque, UPI, etc.
5. **Taxes** — which party bears GST, TDS, etc.
6. **Refunds** — conditions and timeline${disclaimer}`;
  }

  // ── TERMINATION ────────────────────────────────────────────────────────────
  if (lower.includes("terminat") || lower.includes("cancel") || lower.includes("end") || lower.includes("exit") || lower.includes("expire") || lower.includes("notice period")) {
    if (hc) {
      const termEx = excerpts(ct, ["terminat", "cancel", "notice", "expire", "end", "cessation", "withdraw"], 3);
      return `**Termination Provisions in "${name}"**

${termEx.length > 0
  ? `**Termination language found in your document:**\n\n${termEx.map(e => `"${e}"`).join("\n\n")}`
  : "No specific termination provisions were clearly extracted."}

**Termination checklist:**
- ☐ Notice period required (30, 60, or 90 days?)
- ☐ Termination for cause vs. convenience
- ☐ Obligations that survive after termination
- ☐ Penalties for early termination
- ☐ Permitted termination methods (written notice, email, registered post)
- ☐ Effect on pending payments and deliverables${disclaimer}`;
    }
    return `**Termination Provisions in "${name}"**

Standard termination provisions:
1. **Notice Period** — typically 30–90 days written notice
2. **For Cause** — immediate termination on material breach
3. **For Convenience** — either party can exit with adequate notice
4. **Survival Clauses** — confidentiality, IP, and outstanding payments survive termination
5. **Early Exit Penalty** — check if there are any fees for terminating before the agreed term${disclaimer}`;
  }

  // ── DEFAULT RESPONSE ───────────────────────────────────────────────────────
  if (hc) {
    const general = excerpts(ct, message.toLowerCase().split(/\s+/).filter(w => w.length > 3), 3);
    return `**Analysis of "${name}"**

You asked: *"${message}"*

${general.length > 0
  ? `**Relevant passages from your document:**\n\n${general.map(e => `"${e}"`).join("\n\n")}\n\n`
  : ""}**About this document (${inferDocType(docName)}):**
${inferPurpose(docName)}

For specific legal interpretation of this clause or provision, a qualified attorney in the relevant jurisdiction should be consulted. They can consider the full document context and applicable local laws.${disclaimer}`;
  }

  return `**Legal Analysis: "${name}"**

You asked: *"${message}"*

This is a **${inferDocType(docName)}** — ${inferPurpose(docName).toLowerCase()}.

Key considerations:
1. Read the document as a whole — no clause stands alone
2. Jurisdiction: check the governing law clause
3. Enforceability: provisions against public policy may not hold
4. Seek legal counsel for definitive interpretation of specific provisions

*Upload a text-readable document to receive content-specific answers.*${disclaimer}`;
}

function inferDocType(name: string): string {
  const l = name.toLowerCase();
  if (l.includes("nda") || l.includes("non-disclosure") || l.includes("confidential")) return "Non-Disclosure Agreement (NDA)";
  if (l.includes("rental") || l.includes("lease") || l.includes("tenancy")) return "Rental / Lease Agreement";
  if (l.includes("employment") || l.includes("job") || l.includes("offer")) return "Employment Agreement";
  if (l.includes("service")) return "Service Agreement";
  if (l.includes("notice") || l.includes("legal_notice")) return "Legal Notice";
  if (l.includes("complaint")) return "Formal Complaint";
  if (l.includes("contract")) return "Contract";
  if (l.includes("agreement")) return "Legal Agreement";
  return "Legal Document";
}

function inferPurpose(name: string): string {
  const l = name.toLowerCase();
  if (l.includes("nda") || l.includes("confidential")) return "To protect confidential information shared between parties";
  if (l.includes("rental") || l.includes("lease")) return "To establish terms for renting a property";
  if (l.includes("employment")) return "To define the terms and conditions of employment";
  if (l.includes("service")) return "To define the scope and terms of services to be provided";
  return "To establish legally binding obligations between the parties";
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post("/chat", requireAuth, async (req, res) => {
  try {
    const { message, documentId, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    const [userMsg] = await db.insert(chatHistoryTable).values({
      role: "user",
      content: message,
      documentId: documentId || null,
      sessionId: sessionId || null,
      userId: req.userId!,
    }).returning();

    let docName = "the document";
    let docContent: string | null = null;
    if (documentId) {
      const [doc] = await db.select().from(documentsTable)
        .where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, req.userId!)))
        .limit(1);
      if (doc) {
        docName = doc.name;
        docContent = doc.content || doc.summary || null;
      }
    }

    const aiContent = buildResponse(message, docName, docContent);
    const sources = documentId
      ? JSON.stringify([{ document: docName, source: "LegalGPT Document Engine", contentAvailable: !!docContent }])
      : null;

    const [aiMsg] = await db.insert(chatHistoryTable).values({
      role: "assistant",
      content: aiContent,
      documentId: documentId || null,
      sessionId: userMsg.sessionId,
      sources,
      userId: req.userId!,
    }).returning();

    await db.insert(adminLogsTable).values({
      action: "ai_query",
      userId: req.userId,
      details: `AI query on "${docName}": ${message.substring(0, 60)}`,
    });

    res.json({
      id: aiMsg.id,
      role: aiMsg.role,
      content: aiMsg.content,
      sources: aiMsg.sources,
      createdAt: aiMsg.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Chat error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/chat/history", requireAuth, async (req, res) => {
  try {
    const messages = await db.select().from(chatHistoryTable)
      .where(eq(chatHistoryTable.userId, req.userId!));
    res.json(messages.map(m => ({
      id: m.id, role: m.role, content: m.content,
      documentId: m.documentId, sessionId: m.sessionId,
      sources: m.sources, createdAt: m.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Chat history error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
