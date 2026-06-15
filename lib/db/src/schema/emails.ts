import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const sentEmailsTable = pgTable("sent_emails", {
  id: serial("id").primaryKey(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  draftId: integer("draft_id"),
  status: text("status").notNull().default("sent"),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export const insertEmailSchema = createInsertSchema(sentEmailsTable).omit({ id: true, sentAt: true });
export type InsertEmail = z.infer<typeof insertEmailSchema>;
export type SentEmail = typeof sentEmailsTable.$inferSelect;
