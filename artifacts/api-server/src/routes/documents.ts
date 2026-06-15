import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, adminLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.get("/documents", requireAuth, async (req, res) => {
  try {
    const docs = await db.select().from(documentsTable).where(eq(documentsTable.userId, req.userId!));
    res.json(docs.map(d => ({
      id: d.id, name: d.name, size: d.size, type: d.type,
      status: d.status, uploadDate: d.uploadDate.toISOString(),
      userId: d.userId, summary: d.summary,
    })));
  } catch (err) {
    req.log.error({ err }, "List documents error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents", requireAuth, async (req, res) => {
  try {
    const { name, size, type, content } = req.body;
    if (!name || !size || !type) {
      return res.status(400).json({ error: "Name, size and type are required" });
    }
    const [doc] = await db.insert(documentsTable).values({
      name, size, type, content: content || null,
      status: "processed",
      userId: req.userId!,
    }).returning();

    await db.insert(adminLogsTable).values({
      action: "document_upload",
      userId: req.userId,
      details: `Uploaded document: ${name}`,
    });

    res.status(201).json({
      id: doc.id, name: doc.name, size: doc.size, type: doc.type,
      status: doc.status, uploadDate: doc.uploadDate.toISOString(),
      userId: doc.userId, summary: doc.summary,
    });
  } catch (err) {
    req.log.error({ err }, "Upload document error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/documents/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(documentsTable)
      .where(and(eq(documentsTable.id, id), eq(documentsTable.userId, req.userId!)))
      .limit(1);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.json({
      id: doc.id, name: doc.name, size: doc.size, type: doc.type,
      status: doc.status, uploadDate: doc.uploadDate.toISOString(),
      userId: doc.userId, summary: doc.summary,
    });
  } catch (err) {
    req.log.error({ err }, "Get document error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/documents/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(documentsTable)
      .where(and(eq(documentsTable.id, id), eq(documentsTable.userId, req.userId!)));
    res.json({ success: true, message: "Document deleted" });
  } catch (err) {
    req.log.error({ err }, "Delete document error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
