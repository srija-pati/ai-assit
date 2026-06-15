import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { documentsTable } from "./documents";

export const clauseExtractionsTable = pgTable("clause_extractions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id),
  clauses: text("clauses").notNull(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  extractedAt: timestamp("extracted_at").notNull().defaultNow(),
});

export const insertClauseSchema = createInsertSchema(clauseExtractionsTable).omit({ id: true, extractedAt: true });
export type InsertClause = z.infer<typeof insertClauseSchema>;
export type ClauseExtraction = typeof clauseExtractionsTable.$inferSelect;
