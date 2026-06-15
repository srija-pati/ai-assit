import { Router } from "express";
import { db } from "@workspace/db";
import { clauseExtractionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

function extractMockClauses(documentId: number) {
  return {
    partiesInvolved: "Party A: ABC Corporation (Client), Party B: XYZ Services Ltd (Service Provider)",
    importantDates: "Effective Date: January 1, 2024; Expiration Date: December 31, 2024; Review Date: June 30, 2024",
    paymentTerms: "Payment due within 30 days of invoice. Late payment incurs 1.5% monthly interest. Accepted methods: bank transfer, cheque.",
    terminationClause: "Either party may terminate this agreement with 30 days written notice. Immediate termination permitted for material breach.",
    confidentialityClause: "Both parties agree to keep all shared information confidential for 5 years after termination. Exceptions: publicly available information.",
    liabilityClause: "Total liability capped at the value of the contract. Neither party liable for indirect or consequential damages.",
    disputeResolution: "All disputes to be resolved through binding arbitration under ICC Rules. Seat of arbitration: New Delhi, India.",
    riskyClauses: "WARNING: Broad IP assignment clause (Section 7.2) may capture pre-existing IP. Unlimited liability in Section 8 needs negotiation. Auto-renewal requires 60-day advance notice.",
  };
}

router.post("/extract-clauses", requireAuth, async (req, res) => {
  try {
    const { documentId } = req.body;
    if (!documentId) return res.status(400).json({ error: "documentId is required" });

    const clauses = extractMockClauses(documentId);

    const [extraction] = await db.insert(clauseExtractionsTable).values({
      documentId,
      clauses: JSON.stringify(clauses),
      userId: req.userId!,
    }).returning();

    res.json({
      id: extraction.id,
      documentId: extraction.documentId,
      clauses,
      extractedAt: extraction.extractedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Extract clauses error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/clause-extractions", requireAuth, async (req, res) => {
  try {
    const extractions = await db.select().from(clauseExtractionsTable)
      .where(eq(clauseExtractionsTable.userId, req.userId!));
    res.json(extractions.map(e => ({
      id: e.id, documentId: e.documentId,
      clauses: e.clauses, extractedAt: e.extractedAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "List clause extractions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
