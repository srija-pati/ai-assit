import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { logger } from "../lib/logger";

const router = Router();

function hashPassword(password: string): string {
  return createHash("sha256").update(password + "legalgpt_salt").digest("hex");
}

function generateToken(userId: number): string {
  return Buffer.from(`${userId}:${randomBytes(16).toString("hex")}`).toString("base64");
}

router.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }
    const [user] = await db.insert(usersTable).values({
      name,
      email,
      passwordHash: hashPassword(password),
      role: "user",
    }).returning();
    const token = generateToken(user.id);
    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt.toISOString() },
      token,
    });
  } catch (err) {
    req.log.error({ err }, "Signup error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const token = generateToken(user.id);
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt.toISOString() },
      token,
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});

router.get("/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const userId = parseInt(decoded.split(":")[0]);
    if (isNaN(userId)) return res.status(401).json({ error: "Invalid token" });
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Get current user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
