import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      // Try to use demo user (user id=2) if no auth header for demo purposes
      req.userId = 2;
      req.userRole = "user";
      return next();
    }
    const token = authHeader.replace("Bearer ", "");
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const userId = parseInt(decoded.split(":")[0]);
    if (isNaN(userId)) {
      req.userId = 2;
      req.userRole = "user";
      return next();
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (user) {
      req.userId = user.id;
      req.userRole = user.role;
    } else {
      req.userId = 2;
      req.userRole = "user";
    }
    next();
  } catch {
    req.userId = 2;
    req.userRole = "user";
    next();
  }
}
