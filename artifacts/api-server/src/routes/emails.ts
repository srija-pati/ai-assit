import { Router } from "express";
import { db } from "@workspace/db";
import { sentEmailsTable, adminLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.post("/send-email", requireAuth, async (req, res) => {
  try {
    const { recipientEmail, subject, body, draftId } = req.body;
    if (!recipientEmail || !subject || !body) {
      return res.status(400).json({ error: "Recipient email, subject and body are required" });
    }

    const [email] = await db.insert(sentEmailsTable).values({
      recipientEmail, subject, body,
      draftId: draftId || null,
      status: "sent",
      userId: req.userId!,
    }).returning();

    await db.insert(adminLogsTable).values({
      action: "email_sent",
      userId: req.userId,
      details: `Email sent to: ${recipientEmail}`,
    });

    res.json({
      id: email.id, recipientEmail: email.recipientEmail, subject: email.subject,
      body: email.body, draftId: email.draftId, sentAt: email.sentAt.toISOString(),
      status: email.status,
    });
  } catch (err) {
    req.log.error({ err }, "Send email error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/emails", requireAuth, async (req, res) => {
  try {
    const emails = await db.select().from(sentEmailsTable)
      .where(eq(sentEmailsTable.userId, req.userId!));
    res.json(emails.map(e => ({
      id: e.id, recipientEmail: e.recipientEmail, subject: e.subject,
      body: e.body, draftId: e.draftId, sentAt: e.sentAt.toISOString(), status: e.status,
    })));
  } catch (err) {
    req.log.error({ err }, "List emails error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
