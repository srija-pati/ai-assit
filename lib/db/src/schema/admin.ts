import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminLogsTable = pgTable("admin_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  userId: integer("user_id"),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminLogSchema = createInsertSchema(adminLogsTable).omit({ id: true, createdAt: true });
export type InsertAdminLog = z.infer<typeof insertAdminLogSchema>;
export type AdminLog = typeof adminLogsTable.$inferSelect;
