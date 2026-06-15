import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const generatedDraftsTable = pgTable("generated_drafts", {
  id: serial("id").primaryKey(),
  documentType: text("document_type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  clientName: text("client_name").notNull(),
  oppositeName: text("opposite_name").notNull(),
  address: text("address").notNull(),
  purpose: text("purpose").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDraftSchema = createInsertSchema(generatedDraftsTable).omit({ id: true, createdAt: true });
export type InsertDraft = z.infer<typeof insertDraftSchema>;
export type GeneratedDraft = typeof generatedDraftsTable.$inferSelect;
