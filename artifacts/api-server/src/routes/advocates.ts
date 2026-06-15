import { Router } from "express";
import { db } from "@workspace/db";
import { advocatesTable } from "@workspace/db";
import { eq, gte, and, SQL } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.get("/advocates", requireAuth, async (req, res) => {
  try {
    const { location, specialization, minRating, available } = req.query;
    const conditions: SQL[] = [];

    if (location && typeof location === "string") {
      conditions.push(eq(advocatesTable.city, location));
    }
    if (specialization && typeof specialization === "string") {
      conditions.push(eq(advocatesTable.specialization, specialization));
    }
    if (minRating) {
      conditions.push(gte(advocatesTable.rating, parseFloat(minRating as string)));
    }
    if (available !== undefined) {
      conditions.push(eq(advocatesTable.available, available === "true"));
    }

    const advocates = conditions.length > 0
      ? await db.select().from(advocatesTable).where(and(...conditions))
      : await db.select().from(advocatesTable);

    res.json(advocates.map(a => ({
      id: a.id, name: a.name, specialization: a.specialization, city: a.city,
      experience: a.experience, rating: a.rating, available: a.available,
      consultationFee: a.consultationFee, phone: a.phone, email: a.email, bio: a.bio,
    })));
  } catch (err) {
    req.log.error({ err }, "List advocates error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/advocates/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [advocate] = await db.select().from(advocatesTable).where(eq(advocatesTable.id, id)).limit(1);
    if (!advocate) return res.status(404).json({ error: "Advocate not found" });
    res.json({
      id: advocate.id, name: advocate.name, specialization: advocate.specialization,
      city: advocate.city, experience: advocate.experience, rating: advocate.rating,
      available: advocate.available, consultationFee: advocate.consultationFee,
      phone: advocate.phone, email: advocate.email, bio: advocate.bio,
    });
  } catch (err) {
    req.log.error({ err }, "Get advocate error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
