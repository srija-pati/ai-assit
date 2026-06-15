import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const chatHistoryTable = pgTable("chat_history", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  documentId: integer("document_id"),
  sessionId: text("session_id"),
  sources: text("sources"),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertChatSchema = createInsertSchema(chatHistoryTable).omit({ id: true, createdAt: true });
export type InsertChat = z.infer<typeof insertChatSchema>;
export type ChatEntry = typeof chatHistoryTable.$inferSelect;
