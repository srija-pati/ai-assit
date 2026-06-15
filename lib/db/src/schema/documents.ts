import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  summary: text("summary"),
  content: text("content"),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  uploadDate: timestamp("upload_date").notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, uploadDate: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
