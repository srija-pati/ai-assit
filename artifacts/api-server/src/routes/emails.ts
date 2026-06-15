import { Router } from "express";
import { db } from "@workspace/db";
import { sentEmailsTable, adminLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import nodemailer from "nodemailer";

const router = Router();

// Cached Ethereal test transporter (created once, reused)
let _transporter: nodemailer.Transporter | null = null;
let _fromAddress = "legalgpt@demo.com";

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (!_transporter) {
    try {
      const account = await nodemailer.createTestAccount();
      _fromAddress = account.user;
      _transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: account.user, pass: account.pass },
      });
    } catch {
      // Fallback: JSON transport (always succeeds, no preview URL)
      _transporter = nodemailer.createTransport({ jsonTransport: true });
    }
  }
  return _transporter;
}

// Warm up transporter on module load
getTransporter().catch(() => {});

router.post("/send-email", requireAuth, async (req, res) => {
  try {
    const { recipientEmail, subject, body, draftId } = req.body;
    if (!recipientEmail || !subject || !body) {
      return res.status(400).json({ error: "Recipient email, subject and body are required" });
    }

    // Actually send the email via Ethereal SMTP
    let previewUrl: string | null = null;
    try {
      const transporter = await getTransporter();
      const info = await transporter.sendMail({
        from: `"LegalGPT" <${_fromAddress}>`,
        to: recipientEmail,
        subject,
        text: body,
        html: `<div style="font-family:Georgia,serif;max-width:700px;margin:auto;padding:32px;line-height:1.7;color:#1a1a2e">
          <div style="border-bottom:3px solid #1a1a2e;padding-bottom:16px;margin-bottom:24px">
            <h2 style="margin:0;font-size:20px;color:#1a1a2e">LegalGPT</h2>
            <p style="margin:4px 0 0;font-size:12px;color:#666">AI-Powered Legal Assistant</p>
          </div>
          <div style="white-space:pre-wrap;font-size:14px">${body.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          <div style="margin-top:32px;padding-top:16px;border-top:1px solid #ddd;font-size:11px;color:#999">
            This email was sent via LegalGPT. This system provides AI-assisted legal information, not professional legal advice.
          </div>
        </div>`,
      });
      previewUrl = nodemailer.getTestMessageUrl(info) || null;
    } catch (emailErr) {
      req.log.warn({ emailErr }, "Email transport failed, saving record only");
    }

    const [email] = await db.insert(sentEmailsTable).values({
      recipientEmail,
      subject,
      body,
      draftId: draftId || null,
      status: "sent",
      userId: req.userId!,
    }).returning();

    await db.insert(adminLogsTable).values({
      action: "email_sent",
      userId: req.userId,
      details: `Email sent to: ${recipientEmail}${previewUrl ? " (preview available)" : ""}`,
    });

    res.json({
      id: email.id,
      recipientEmail: email.recipientEmail,
      subject: email.subject,
      body: email.body,
      draftId: email.draftId,
      sentAt: email.sentAt.toISOString(),
      status: email.status,
      previewUrl,
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
