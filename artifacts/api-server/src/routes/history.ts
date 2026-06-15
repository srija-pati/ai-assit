import { Router } from "express";
import { db } from "@workspace/db";
import {
  documentsTable, chatHistoryTable, clauseExtractionsTable,
  generatedDraftsTable, sentEmailsTable
} from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.get("/history", requireAuth, async (req, res) => {
  try {
    const [docs, chats, extractions, drafts, emails] = await Promise.all([
      db.select().from(documentsTable).where(eq(documentsTable.userId, req.userId!)).limit(5),
      db.select().from(chatHistoryTable).where(eq(chatHistoryTable.userId, req.userId!)).limit(5),
      db.select().from(clauseExtractionsTable).where(eq(clauseExtractionsTable.userId, req.userId!)).limit(5),
      db.select().from(generatedDraftsTable).where(eq(generatedDraftsTable.userId, req.userId!)).limit(5),
      db.select().from(sentEmailsTable).where(eq(sentEmailsTable.userId, req.userId!)).limit(5),
    ]);

    const items = [
      ...docs.map(d => ({ id: d.id, type: "upload" as const, description: `Uploaded: ${d.name}`, createdAt: d.uploadDate.toISOString(), metadata: null })),
      ...chats.filter(c => c.role === "user").map(c => ({ id: c.id * 100, type: "chat" as const, description: `Asked: ${c.content.substring(0, 60)}...`, createdAt: c.createdAt.toISOString(), metadata: null })),
      ...extractions.map(e => ({ id: e.id * 200, type: "extract" as const, description: `Extracted clauses from document #${e.documentId}`, createdAt: e.extractedAt.toISOString(), metadata: null })),
      ...drafts.map(d => ({ id: d.id * 300, type: "generate" as const, description: `Generated: ${d.title}`, createdAt: d.createdAt.toISOString(), metadata: null })),
      ...emails.map(e => ({ id: e.id * 400, type: "email" as const, description: `Sent email to: ${e.recipientEmail}`, createdAt: e.sentAt.toISOString(), metadata: null })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(items);
  } catch (err) {
    req.log.error({ err }, "History error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  try {
    const [
      [{ value: uploadedDocuments }],
      [{ value: questionsAsked }],
      [{ value: draftsGenerated }],
      [{ value: lettersSent }],
      recentDocs, recentChats, recentDrafts,
    ] = await Promise.all([
      db.select({ value: count() }).from(documentsTable).where(eq(documentsTable.userId, req.userId!)),
      db.select({ value: count() }).from(chatHistoryTable).where(eq(chatHistoryTable.userId, req.userId!)),
      db.select({ value: count() }).from(generatedDraftsTable).where(eq(generatedDraftsTable.userId, req.userId!)),
      db.select({ value: count() }).from(sentEmailsTable).where(eq(sentEmailsTable.userId, req.userId!)),
      db.select().from(documentsTable).where(eq(documentsTable.userId, req.userId!)).limit(3),
      db.select().from(chatHistoryTable).where(eq(chatHistoryTable.userId, req.userId!)).limit(3),
      db.select().from(generatedDraftsTable).where(eq(generatedDraftsTable.userId, req.userId!)).limit(2),
    ]);

    const recentActivity = [
      ...recentDocs.map(d => ({ id: d.id, type: "upload" as const, description: `Uploaded: ${d.name}`, createdAt: d.uploadDate.toISOString(), metadata: null })),
      ...recentChats.filter(c => c.role === "user").map(c => ({ id: c.id * 100, type: "chat" as const, description: `Asked: ${c.content.substring(0, 50)}...`, createdAt: c.createdAt.toISOString(), metadata: null })),
      ...recentDrafts.map(d => ({ id: d.id * 300, type: "generate" as const, description: `Generated: ${d.title}`, createdAt: d.createdAt.toISOString(), metadata: null })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

    res.json({
      uploadedDocuments: Number(uploadedDocuments),
      questionsAsked: Number(questionsAsked),
      draftsGenerated: Number(draftsGenerated),
      advocatesFound: 12,
      lettersSent: Number(lettersSent),
      recentActivity,
    });
  } catch (err) {
    req.log.error({ err }, "Dashboard summary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
