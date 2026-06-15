import { pgTable, text, serial, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const advocatesTable = pgTable("advocates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  specialization: text("specialization").notNull(),
  city: text("city").notNull(),
  experience: integer("experience").notNull(),
  rating: real("rating").notNull().default(4.0),
  available: boolean("available").notNull().default(true),
  consultationFee: integer("consultation_fee").notNull(),
  phone: text("phone"),
  email: text("email"),
  bio: text("bio"),
});

export const insertAdvocateSchema = createInsertSchema(advocatesTable).omit({ id: true });
export type InsertAdvocate = z.infer<typeof insertAdvocateSchema>;
export type Advocate = typeof advocatesTable.$inferSelect;
