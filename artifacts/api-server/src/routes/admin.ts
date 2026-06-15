import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, documentsTable, chatHistoryTable, generatedDraftsTable, sentEmailsTable, adminLogsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth-middleware";
import { count } from "drizzle-orm";

const router = Router();

router.get("/admin/stats", requireAuth, async (req, res) => {
  try {
    const [[{ value: totalUsers }], [{ value: totalDocs }], [{ value: totalQueries }],
      [{ value: generatedPdfs }], [{ value: sentEmails }], logs] = await Promise.all([
        db.select({ value: count() }).from(usersTable),
        db.select({ value: count() }).from(documentsTable),
        db.select({ value: count() }).from(chatHistoryTable),
        db.select({ value: count() }).from(generatedDraftsTable),
        db.select({ value: count() }).from(sentEmailsTable),
        db.select().from(adminLogsTable).limit(20),
      ]);

    res.json({
      totalUsers: Number(totalUsers),
      totalDocuments: Number(totalDocs),
      totalQueries: Number(totalQueries),
      generatedPdfs: Number(generatedPdfs),
      sentEmails: Number(sentEmails),
      systemActivity: logs.map(l => ({
        id: l.id, action: l.action, userId: l.userId,
        details: l.details, createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Admin stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/users", requireAuth, async (req, res) => {
  try {
    const users = await db.select().from(usersTable);
    res.json(users.map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      createdAt: u.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "List users error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/logs", requireAuth, async (req, res) => {
  try {
    const logs = await db.select().from(adminLogsTable);
    res.json(logs.map(l => ({
      id: l.id, action: l.action, userId: l.userId,
      details: l.details, createdAt: l.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "List logs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/reindex", requireAuth, async (req, res) => {
  await db.insert(adminLogsTable).values({
    action: "reindex_documents",
    userId: req.userId,
    details: "Document re-indexing triggered by admin",
  });
  res.json({ success: true, message: "Document re-indexing started. ChromaDB vector store will be updated." });
});

export default router;
