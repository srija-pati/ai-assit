import { Router } from "express";
import { db } from "@workspace/db";
import { chatHistoryTable, adminLogsTable, documentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

// ─── Document-aware AI engine ─────────────────────────────────────────────────

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 800);
}

function scoreRelevance(sentence: string, queryWords: string[]): number {
  const sl = sentence.toLowerCase();
  return queryWords.reduce((score, w) => score + (sl.includes(w) ? 1 : 0), 0);
}

function topSentences(content: string, queryWords: string[], n = 4): string[] {
  const all = sentences(content);
  return all
    .map(s => ({ s, score: scoreRelevance(s, queryWords) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .filter(x => x.score > 0 || n <= 2)
    .map(x => x.s);
}

function docOpening(content: string, maxChars = 500): string {
  return content.replace(/\s+/g, " ").trim().substring(0, maxChars);
}

// Detect broad intent from any natural-language question
function detectIntent(q: string): string {
  const l = q.toLowerCase();
  if (/summar|overview|brief|gist|about|what is this|what does this|tell me about/.test(l)) return "summary";
  if (/clause|provision|section|article|term|condition|stipulat|extract/.test(l)) return "clauses";
  if (/risk|danger|concern|issue|problem|flag|worry|careful|warn|liab|penalty|forfeit|breach/.test(l)) return "risk";
  if (/explain|simple|plain|layman|easy|mean|understand|clarify|what does/.test(l)) return "explain";
  if (/party|parties|who|signator|between|name|person|company|entity/.test(l)) return "parties";
  if (/pay|fee|money|amount|price|cost|salary|rent|compensation|consideration|rupee|inr|\$/.test(l)) return "payment";
  if (/terminat|cancel|end|exit|expire|notice period|withdrawal|rescind/.test(l)) return "termination";
  if (/nda|non.disclosure|confidential|secret|proprietary/.test(l)) return "nda";
  if (/date|duration|period|term|how long|start|end date|valid|expire/.test(l)) return "dates";
  if (/obligat|duty|responsib|must|shall|required|mandate|need to/.test(l)) return "obligations";
  if (/penalt|fine|damage|compens|liabil|consequen|breach/.test(l)) return "penalties";
  if (/govern|jurisdiction|court|law|applicable|dispute|arbitrat|mediat/.test(l)) return "jurisdiction";
  if (/intellectual|ip |copyright|patent|trademark|proprietary right|ownership/.test(l)) return "ip";
  if (/force majeure|act of god|unforeseen|pandemic|natural|disaster/.test(l)) return "force_majeure";
  if (/sign|execut|witness|notari|stamp|registr/.test(l)) return "execution";
  return "general";
}

function buildAIResponse(message: string, docName: string, docContent: string | null): string {
  const name = docName.replace(/\.[^/.]+$/, "");
  const docType = inferDocType(docName);
  const disclaimer = "\n\n---\n*LegalGPT provides AI-assisted legal information. For binding legal advice, consult a qualified attorney.*";
  const hasContent = !!docContent && docContent.trim().length > 80;
  const intent = detectIntent(message);
  const qWords = message.toLowerCase().split(/\W+/).filter(w => w.length > 3);

  // Helper: find relevant content excerpts
  const getExcerpts = (extraKeywords: string[] = [], n = 3): string[] => {
    if (!hasContent) return [];
    return topSentences(docContent!, [...qWords, ...extraKeywords], n);
  };

  const withContent = (build: (excerpts: string[]) => string, fallback: () => string): string => {
    if (!hasContent) return fallback();
    const exc = getExcerpts([], 4);
    return build(exc);
  };

  switch (intent) {
    case "summary":
      return withContent(
        (exc) => `Here's a summary of **"${name}"**:

**Document type:** ${docType}

**Opening:**
> ${docOpening(docContent!, 400)}

**Key content from the document:**
${exc.length > 0 ? exc.map(e => `- ${e}`).join("\n") : "- Document content is available but key sentences could not be individually extracted."}

**What this document does:**
This is a ${docType.toLowerCase()} that ${inferPurpose(docName).toLowerCase()}. It establishes legal rights and obligations between the parties named within it.${disclaimer}`,
        () => `**"${name}"** is a **${docType}** — ${inferPurpose(docName).toLowerCase()}.

Key areas this type of document typically covers:
- Identification of all parties and their roles
- Core obligations and what each party must perform
- Term, duration, and how the agreement can be ended
- Payment or consideration (if applicable)
- Dispute resolution and governing law

*Re-upload the document as a text file (TXT) for content-specific analysis.*${disclaimer}`
      );

    case "clauses":
      return withContent(
        (exc) => `Here are the key clauses I found in **"${name}"**:

${exc.length > 0
  ? exc.map((e, i) => `**Clause ${i + 1}:**\n> "${e}"`).join("\n\n")
  : "No clearly delimited clause text was extracted — the file may be in a format that limits text extraction."}

**Standard clauses expected in a ${docType}:**
1. **Parties** — full legal names and capacities
2. **Recitals/Whereas** — background and purpose
3. **Consideration** — what each side gives and receives
4. **Term & Termination** — duration and exit conditions
5. **Confidentiality** — information restrictions
6. **Liability** — cap on damages
7. **Governing Law** — applicable jurisdiction${disclaimer}`,
        () => `**Key Clauses in a ${docType} ("${name}"):**

1. **Parties Clause** — full legal names and addresses of both sides
2. **Recitals** — background context explaining why this agreement exists
3. **Consideration** — the exchange of value (money, services, etc.)
4. **Obligations** — what each party must do and by when
5. **Term & Termination** — start date, duration, notice period, and exit rights
6. **Confidentiality** — non-disclosure obligations and duration
7. **Indemnification & Liability** — who bears losses and any damage caps
8. **Intellectual Property** — ownership of any created work
9. **Dispute Resolution** — arbitration, mediation, or litigation
10. **Governing Law** — which state/country's law applies${disclaimer}`
      );

    case "risk":
      return withContent(
        (exc) => {
          const riskKw = ["liable", "penalty", "breach", "terminat", "damages", "forfeit", "indemnif", "fine", "loss", "unlimited"];
          const riskExc = topSentences(docContent!, riskKw, 4);
          return `**Risk Analysis for "${name}"**

${riskExc.length > 0
  ? `**⚠️ Potentially risky provisions I found in your document:**\n\n${riskExc.map((e, i) => `**Risk ${i + 1}:** "${e}"`).join("\n\n")}`
  : "No high-risk language was clearly extracted, but always verify manually."}

**Standard risk checklist for a ${docType}:**

🔴 **High Priority:**
- Unlimited liability — check for damage caps
- Automatic renewal without notice
- Unilateral right to amend contract terms

🟡 **Medium Priority:**
- Overly broad IP assignment (may transfer pre-existing IP)
- Non-compete scope and geographic reach
- Late payment penalties and compounding interest

🟢 **Review:**
- Governing law convenience (is it your jurisdiction?)
- Notice period and method for termination${disclaimer}`;
        },
        () => `**Risk Analysis for "${name}" (${docType})**

**🔴 High Priority — Always Check:**
- **Unlimited liability** — contracts without a damage cap expose you to unlimited financial loss
- **Automatic renewal clauses** — can bind you for another term without action
- **Unilateral amendment rights** — one party changing terms alone is a red flag
- **Broad IP assignment** — may unintentionally transfer IP you created before this contract

**🟡 Medium Priority:**
- Non-compete / non-solicitation — verify geographic and time limits
- Interest on late payments (1.5–2%/month is typical; more is aggressive)
- Unclear definition of "breach" — vague language increases dispute risk

**🟢 Always Review:**
- Governing law and jurisdiction — is it convenient for you?
- Notice method for termination — registered post vs. email varies in legal weight${disclaimer}`
      );

    case "explain":
      return withContent(
        (exc) => `Here's **"${name}"** explained in plain language:

**What it is:**
This is a ${docType.toLowerCase()} — ${inferPurpose(docName).toLowerCase()}.

**What the document actually says (in simple terms):**
${exc.length > 0 ? exc.map(e => `> "${e}"`).join("\n\n") : "> Document text was extracted but individual sentences couldn't be isolated."}

**In everyday language:**
- This is a written agreement that creates legal obligations
- Once signed, both parties **must** follow it — breaking it can mean legal consequences
- Deadlines, amounts, and responsibilities are all binding once executed

**Before signing, ask yourself:**
1. Do I understand every obligation I'm taking on?
2. Are the payment/performance terms realistic?
3. What happens if I need to exit early?
4. Is the dispute resolution mechanism fair?${disclaimer}`,
        () => `**Plain Language Explanation of "${name}"** (${docType})

**What it is:**
${inferPurpose(docName)}

**In everyday language:**
- This is a **legal contract** — once signed, it's binding on all parties
- It sets out **what each side must do**, what they get in return, and what happens if something goes wrong
- Breaking the terms ("breach") can lead to **financial penalties** or legal action

**What to check before you sign:**
1. Are all party names and addresses correct?
2. Is the term/duration what you agreed?
3. Are payment amounts and schedules clearly stated?
4. Is there an exit clause if things go wrong?
5. Which court handles disputes?

*Upload a text-extractable document (TXT or copy-pasted text) for specific content analysis.*${disclaimer}`
      );

    case "parties":
      return withContent(
        (exc) => {
          const partyKw = ["between", "party", "hereinafter", "referred to as", "employer", "employee", "lessor", "lessee", "buyer", "seller", "client", "vendor", "disclos"];
          const partyExc = topSentences(docContent!, partyKw, 3);
          return `**Parties in "${name}"**

${partyExc.length > 0
  ? `**Party information extracted from your document:**\n\n${partyExc.map(e => `> "${e}"`).join("\n\n")}`
  : "Party names were not clearly isolated from the document text."}

*For exact legal names and roles, refer to the recitals and signature block of the original document.*${disclaimer}`;
        },
        () => `**Parties in "${name}"** (${docType})

This type of document typically involves:
- **First Party (Party A):** The initiating party — Disclosing Party / Employer / Landlord / Service Provider / Seller
- **Second Party (Party B):** The counterparty — Receiving Party / Employee / Tenant / Client / Buyer
- **Witnesses / Guarantors:** Additional signatories who may be named in the signature block

For exact legal names, addresses, and designations, always refer to the recitals section and signature block of the original document.${disclaimer}`
      );

    case "payment":
      return withContent(
        (exc) => {
          const payKw = ["payment", "fee", "amount", "rupee", "inr", "usd", "$", "pay", "salary", "rent", "consideration", "sum of", "compensation"];
          const payExc = topSentences(docContent!, payKw, 3);
          return `**Payment Terms in "${name}"**

${payExc.length > 0
  ? `**Financial provisions found in your document:**\n\n${payExc.map(e => `> "${e}"`).join("\n\n")}`
  : "No specific monetary amounts were clearly extracted from the document."}

**Payment checklist:**
- ☐ Exact amount and currency clearly stated
- ☐ Payment schedule and due dates
- ☐ Late payment interest / penalty clause
- ☐ Accepted payment methods
- ☐ Tax responsibilities (GST, TDS, etc.)
- ☐ Refund or reversal conditions${disclaimer}`;
        },
        () => `**Payment Terms in "${name}"** (${docType})

**Key payment provisions to verify:**
1. **Amount** — exact figure and currency (INR/USD/etc.)
2. **Schedule** — due date(s), installments, or milestone-based payments
3. **Late Payment** — interest or penalty (typically 1.5–2%/month)
4. **Method** — bank transfer, cheque, UPI, cash
5. **Taxes** — who pays GST, TDS, or other applicable taxes
6. **Refund Policy** — conditions under which money is returned

*Upload a text-readable version for specific amounts and dates from your document.*${disclaimer}`
      );

    case "termination":
      return withContent(
        (exc) => {
          const termKw = ["terminat", "cancel", "notice", "expire", "cessation", "withdraw", "end of", "either party", "30 days", "60 days", "90 days"];
          const termExc = topSentences(docContent!, termKw, 3);
          return `**Termination Provisions in "${name}"**

${termExc.length > 0
  ? `**Termination language from your document:**\n\n${termExc.map(e => `> "${e}"`).join("\n\n")}`
  : "No explicit termination language was clearly extracted."}

**Termination checklist:**
- ☐ Notice period required (30/60/90 days?)
- ☐ Termination for cause vs. convenience — what triggers each?
- ☐ Obligations that survive termination (confidentiality, IP, pending payments)
- ☐ Penalties for early termination
- ☐ Required notice method (written, email, registered post)
- ☐ Effect on in-progress work or deliverables${disclaimer}`;
        },
        () => `**Termination Provisions in "${name}"** (${docType})

**Standard termination provisions:**
1. **Notice Period** — typically 30–90 days written notice required
2. **Termination for Cause** — immediate exit if a material breach occurs
3. **Termination for Convenience** — either party exits with adequate notice, no reason needed
4. **Survival Clauses** — confidentiality, IP ownership, and outstanding payments survive termination
5. **Early Exit Penalty** — some contracts charge fees for ending before the agreed term
6. **Required Method** — registered post, email with acknowledgment, or delivery-confirmed notice

Check whether termination requires a specific form (written only) and what the exact notice period is.${disclaimer}`
      );

    case "nda":
      return withContent(
        (exc) => {
          const ndaKw = ["confidential", "disclose", "secret", "proprietary", "non-disclosure", "shall not", "restrict"];
          const ndaExc = topSentences(docContent!, ndaKw, 3);
          return `**Confidentiality / NDA Analysis for "${name}"**

${ndaExc.length > 0
  ? `**Confidentiality provisions found:**\n\n${ndaExc.map(e => `> "${e}"`).join("\n\n")}`
  : "No explicit confidentiality language was clearly extracted."}

**NDA Checklist:**
- ☐ Is "Confidential Information" defined? Is the definition too broad?
- ☐ Duration — how long does confidentiality apply? (2–5 years is typical)
- ☐ Permitted disclosures — are legal/regulatory exceptions listed?
- ☐ Return/destruction of information on termination
- ☐ Mutual vs. one-sided obligations — who is bound?
- ☐ Remedies for breach — injunctive relief is the usual default${disclaimer}`;
        },
        () => `**NDA / Confidentiality Analysis for "${name}"**

**Key NDA provisions to check:**
1. **Definition** — what counts as "Confidential Information"? Vague definitions = disputes
2. **Duration** — typical range is 2–5 years; indefinite confidentiality is unusual and may be unenforceable
3. **Permitted Disclosures** — legally required disclosures are typically excepted
4. **Obligations on Exit** — must confidential materials be returned or destroyed?
5. **Mutual vs. One-Sided** — only one party? Or both?
6. **Remedies for Breach** — injunctive relief (court order to stop disclosure) is the standard remedy${disclaimer}`
      );

    case "dates":
      return withContent(
        (exc) => {
          const dateKw = ["date", "day of", "year", "month", "period", "commenc", "effective", "valid", "expir", "duration", "term of"];
          const dateExc = topSentences(docContent!, dateKw, 4);
          return `**Dates & Duration in "${name}"**

${dateExc.length > 0
  ? `**Date/period references found in your document:**\n\n${dateExc.map(e => `> "${e}"`).join("\n\n")}`
  : "No specific dates were clearly extracted from the document text."}

**Key dates to verify:**
- ☐ Effective/commencement date
- ☐ Expiry or end date (if fixed-term)
- ☐ Notice period for termination or renewal
- ☐ Payment deadlines
- ☐ Renewal/auto-renewal date${disclaimer}`;
        },
        () => `**Dates & Duration in "${name}"** (${docType})

**Key dates to look for:**
1. **Effective Date** — when the agreement begins
2. **Term/Duration** — fixed period (e.g., 1 year) or rolling/indefinite
3. **Renewal Date** — when auto-renewal kicks in (usually requires notice to cancel before this)
4. **Termination Notice Deadline** — how many days before the renewal date must you give notice?
5. **Payment Dates** — due dates for installments or fees
6. **Milestones** — deliverable deadlines if the contract is project-based${disclaimer}`
      );

    case "obligations":
      return withContent(
        (exc) => {
          const oblKw = ["shall", "must", "required to", "obligat", "duty", "responsib", "agrees to", "undertakes", "covenant"];
          const oblExc = topSentences(docContent!, oblKw, 4);
          return `**Obligations in "${name}"**

${oblExc.length > 0
  ? `**Obligation language found in your document:**\n\n${oblExc.map(e => `> "${e}"`).join("\n\n")}`
  : "No explicit obligation language was clearly extracted."}

**Common obligations in a ${docType}:**
- What each party **must do** (deliverables, services, payments)
- What each party **must not do** (non-compete, non-solicitation, etc.)
- **Timelines** attached to each obligation
- **Consequences** of failing to meet an obligation${disclaimer}`;
        },
        () => `**Obligations in "${name}"** (${docType})

**What to look for:**
1. **Affirmative Obligations** ("shall", "must", "agrees to") — things each party is required to do
2. **Negative Obligations** ("shall not", "must not") — things they're prohibited from doing
3. **Timelines** — when must each obligation be fulfilled?
4. **Performance Standards** — how well? Best efforts? Reasonable care?
5. **Consequences of Non-Performance** — breach, damages, termination rights

Look for words like "shall," "must," "agrees to," "undertakes," and "covenants" — these mark binding obligations.${disclaimer}`
      );

    case "penalties":
      return withContent(
        (exc) => {
          const penKw = ["penalty", "fine", "damages", "compensation", "liable", "breach", "default", "forfeit", "interest"];
          const penExc = topSentences(docContent!, penKw, 3);
          return `**Penalties & Damages in "${name}"**

${penExc.length > 0
  ? `**Penalty provisions found:**\n\n${penExc.map(e => `> "${e}"`).join("\n\n")}`
  : "No specific penalty provisions were clearly extracted."}

**Common penalty types to watch for:**
- Liquidated damages — pre-agreed penalty amount for specific breaches
- Interest on late payments (check the rate — anything above 24%/year is aggressive)
- Forfeiture of advance/deposit on early exit
- Indemnification obligations — making the other party whole for any loss you cause${disclaimer}`;
        },
        () => `**Penalties & Damages in "${name}"** (${docType})

**Types of penalties to look for:**
1. **Liquidated Damages** — pre-agreed fixed penalty for specific breaches
2. **Interest on Late Payment** — typically 1.5–2%/month; check if compounding
3. **Indemnification** — you may be required to compensate the other party for their losses
4. **Forfeiture** — advance or security deposit may be forfeited on breach
5. **Specific Performance** — a court can order you to actually perform, not just pay damages

Always check whether there is a **liability cap** — a ceiling on the maximum amount you can be made to pay.${disclaimer}`
      );

    case "jurisdiction":
      return withContent(
        (exc) => {
          const jurKw = ["govern", "jurisdiction", "court", "law of", "state of", "applicable law", "dispute", "arbitrat", "mediat", "tribunal"];
          const jurExc = topSentences(docContent!, jurKw, 3);
          return `**Governing Law & Dispute Resolution in "${name}"**

${jurExc.length > 0
  ? `**Jurisdiction provisions found:**\n\n${jurExc.map(e => `> "${e}"`).join("\n\n")}`
  : "No specific governing law or jurisdiction provisions were clearly extracted."}

**What to verify:**
- ☐ Which state/country's law governs?
- ☐ Is the jurisdiction convenient for you (or heavily favours the other party)?
- ☐ Dispute resolution mechanism — arbitration (faster, private) vs. court litigation (public, slower)
- ☐ Arbitration seat and rules (if applicable)
- ☐ Limitation period for filing claims${disclaimer}`;
        },
        () => `**Governing Law & Jurisdiction in "${name}"** (${docType})

**Key provisions:**
1. **Governing Law** — which state/country's law applies to interpreting the contract
2. **Exclusive Jurisdiction** — which courts have authority over disputes
3. **Dispute Resolution Mechanism:**
   - *Arbitration* — private, faster, binding, usually cheaper than courts
   - *Mediation* — non-binding facilitated negotiation (often a required first step)
   - *Litigation* — court proceedings (public, formal, expensive)
4. **Arbitration Rules** — ICC, SIAC, LCIA, or domestic (e.g., Arbitration and Conciliation Act, India)
5. **Limitation Period** — deadline by which claims must be filed${disclaimer}`
      );

    case "ip":
      return withContent(
        (exc) => {
          const ipKw = ["intellectual property", "copyright", "patent", "trademark", "ownership", "work product", "created by", "assign", "license", "proprietary"];
          const ipExc = topSentences(docContent!, ipKw, 3);
          return `**Intellectual Property Provisions in "${name}"**

${ipExc.length > 0
  ? `**IP-related language found in your document:**\n\n${ipExc.map(e => `> "${e}"`).join("\n\n")}`
  : "No specific IP provisions were clearly extracted."}

**IP checklist:**
- ☐ Who owns work created during this engagement?
- ☐ Is pre-existing IP explicitly carved out?
- ☐ Is there a license grant — and is it exclusive or non-exclusive?
- ☐ What happens to IP on termination?
- ☐ Moral rights — are they waived?${disclaimer}`;
        },
        () => `**Intellectual Property in "${name}"** (${docType})

**Key IP provisions to verify:**
1. **Ownership of Work Product** — who owns what you create during the contract?
2. **Pre-existing IP** — is your existing IP carved out / protected?
3. **License vs. Assignment** — a license lets them use it; an assignment transfers ownership permanently
4. **Exclusivity** — exclusive licenses lock you out; non-exclusive allows other users
5. **Moral Rights Waiver** — some contracts waive your right to be credited as creator
6. **Post-termination** — what rights survive after the contract ends?${disclaimer}`
      );

    case "force_majeure":
      return withContent(
        (exc) => {
          const fmKw = ["force majeure", "act of god", "unforeseen", "pandemic", "natural disaster", "war", "flood", "beyond control", "earthquake", "strike"];
          const fmExc = topSentences(docContent!, fmKw, 3);
          return `**Force Majeure in "${name}"**

${fmExc.length > 0
  ? `**Force majeure provisions found:**\n\n${fmExc.map(e => `> "${e}"`).join("\n\n")}`
  : "No explicit force majeure language was clearly extracted."}

**Force majeure checklist:**
- ☐ Is "force majeure" defined? What events are included?
- ☐ Does it cover pandemics, government orders, strikes?
- ☐ Notice requirement — how quickly must the affected party notify?
- ☐ Duration — how long can force majeure suspend obligations?
- ☐ Termination right — can either party exit if force majeure continues too long?${disclaimer}`;
        },
        () => `**Force Majeure in "${name}"** (${docType})

**What force majeure covers:**
Force majeure clauses excuse a party from performance when extraordinary events beyond their control prevent it.

**Typical events covered:**
- Natural disasters (earthquake, flood, hurricane)
- War, civil unrest, terrorism
- Government orders, regulatory changes
- Pandemics and public health emergencies (increasingly included post-COVID)
- Strikes and labour disputes (sometimes excluded — check carefully)

**Key provisions to verify:**
1. Is the list exhaustive or illustrative?
2. Notice deadline — usually 24–72 hours from the triggering event
3. Maximum duration before termination rights arise
4. Whether payment obligations are also suspended${disclaimer}`
      );

    case "execution":
      return withContent(
        (exc) => {
          const execKw = ["sign", "execut", "witness", "stamp", "notari", "seal", "signatur", "hand and seal"];
          const execExc = topSentences(docContent!, execKw, 3);
          return `**Execution Requirements for "${name}"**

${execExc.length > 0
  ? `**Execution-related language found:**\n\n${execExc.map(e => `> "${e}"`).join("\n\n")}`
  : "No specific execution requirements were clearly extracted."}

**Execution checklist:**
- ☐ Authorized signatories — does the person signing have authority?
- ☐ Witness requirements — how many? Must they be adults/independent?
- ☐ Stamp duty — is the document stampable? (Required for enforceability in some jurisdictions)
- ☐ Notarization — required for certain document types (e.g., POA, affidavits)
- ☐ Registration — property agreements often require registration to be enforceable${disclaimer}`;
        },
        () => `**Execution & Signing Requirements for "${name}"** (${docType})

**Execution checklist:**
1. **Authorized Signatories** — only persons with legal authority can bind the entity
2. **Witnesses** — many documents require 1–2 witnesses (must not be parties to the contract)
3. **Stamp Duty** — required in many Indian states; non-stamped documents may be inadmissible
4. **Notarization** — mandatory for Power of Attorney, affidavits, and some property documents
5. **Registration** — immovable property agreements must be registered with the Sub-Registrar
6. **Electronic Signatures** — valid under the IT Act 2000 for most contracts except those requiring physical stamps${disclaimer}`
      );

    default: {
      // General / any other question — search document for relevant content
      const relevant = getExcerpts(qWords, 4);
      if (hasContent && relevant.length > 0) {
        return `**Regarding "${name}" — your question: "${message}"**

Based on what I found in the document:

${relevant.map(e => `> "${e}"`).join("\n\n")}

**Analysis:**
These passages appear most relevant to your question. In the context of a ${docType}, this language typically means that the affected party has specific rights or obligations as described. If this clause is unclear, it is worth seeking legal counsel to confirm its scope and enforceability.

**Want me to dig deeper?** You can ask:
- "Summarize this document"
- "What are the risks here?"
- "Explain this in simple language"
- "What are the payment terms?"
- "Who are the parties?"${disclaimer}`;
      }

      return `**"${name}"** (${docType})

You asked: *"${message}"*

${hasContent
  ? "I searched the document but couldn't find passages directly relevant to that specific question. Here's what I know about this document type:"
  : "This document hasn't had its text fully extracted yet. Here's what I can tell from the document name:"}

This is a **${docType}** — ${inferPurpose(docName).toLowerCase()}.

You can ask me more specific questions like:
- **"Summarize this document"** — get an overview
- **"What are the risks?"** — identify red flags
- **"Explain the payment terms"** — financial provisions
- **"Who are the parties?"** — identify signatories
- **"Explain in simple language"** — plain English explanation
- **"What are the termination clauses?"** — exit provisions

${hasContent ? "" : "*For content-specific analysis, re-upload as a plain text (.txt) file or copy-paste the document text.*"}${disclaimer}`;
    }
  }
}

function inferDocType(name: string): string {
  const l = name.toLowerCase();
  if (l.includes("nda") || l.includes("non-disclosure") || l.includes("confidential")) return "Non-Disclosure Agreement (NDA)";
  if (l.includes("rental") || l.includes("lease") || l.includes("tenancy")) return "Rental / Lease Agreement";
  if (l.includes("employment") || l.includes("job") || l.includes("offer letter")) return "Employment Agreement";
  if (l.includes("service")) return "Service Agreement";
  if (l.includes("notice") || l.includes("legal_notice")) return "Legal Notice";
  if (l.includes("complaint")) return "Formal Complaint Letter";
  if (l.includes("contract")) return "Contract";
  if (l.includes("agreement")) return "Legal Agreement";
  if (l.includes("mou") || l.includes("memorandum")) return "Memorandum of Understanding";
  if (l.includes("power") || l.includes("poa") || l.includes("attorney")) return "Power of Attorney";
  return "Legal Document";
}

function inferPurpose(name: string): string {
  const l = name.toLowerCase();
  if (l.includes("nda") || l.includes("confidential")) return "Protects confidential information shared between parties";
  if (l.includes("rental") || l.includes("lease")) return "Establishes terms for renting or leasing a property";
  if (l.includes("employment")) return "Defines the terms and conditions of an employment relationship";
  if (l.includes("service")) return "Defines the scope, deliverables, and terms of services to be provided";
  if (l.includes("notice")) return "Formally notifies a party of a legal claim, right, or demand";
  return "Establishes legally binding obligations and rights between the parties";
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

    const aiContent = buildAIResponse(message, docName, docContent);
    const sources = documentId
      ? JSON.stringify([{ document: docName, contentExtracted: !!docContent }])
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
      details: `AI query on "${docName}": ${message.substring(0, 80)}`,
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
