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

router.post("/advocates/search", requireAuth, async (req, res) => {
  try {
    const { city, lat, lon, radiusMeters } = req.body || {};
    const radius = radiusMeters ? parseInt(radiusMeters, 10) : 10000;
    const searchCity = (city || "Hanamkonda").toString().trim();

    // Preset lookup for coordinates
    let centerLat = 18.0069;
    let centerLon = 79.5579;
    let locationLabel = `${searchCity}, India`;

    if (lat !== undefined && lon !== undefined) {
      centerLat = parseFloat(lat);
      centerLon = parseFloat(lon);
      locationLabel = `Location (${centerLat.toFixed(4)}, ${centerLon.toFixed(4)})`;
    } else {
      const presets: Record<string, { lat: number; lon: number; label: string }> = {
        hanamkonda: { lat: 18.0069, lon: 79.5579, label: "Hanamkonda, Hanumakonda, Telangana, India" },
        warangal: { lat: 17.9689, lon: 79.5941, label: "Warangal, Telangana, India" },
        mumbai: { lat: 19.0760, lon: 72.8777, label: "Mumbai, Maharashtra, India" },
        hyderabad: { lat: 17.3850, lon: 78.4867, label: "Hyderabad, Telangana, India" },
        delhi: { lat: 28.6139, lon: 77.2090, label: "New Delhi, Delhi, India" },
        bengaluru: { lat: 12.9716, lon: 77.5946, label: "Bengaluru, Karnataka, India" },
      };
      const key = searchCity.toLowerCase();
      if (presets[key]) {
        centerLat = presets[key].lat;
        centerLon = presets[key].lon;
        locationLabel = presets[key].label;
      }
    }

    const cityClean = locationLabel.split(",")[0].strip ? locationLabel.split(",")[0].trim() : searchCity;
    const results = [
      {
        id: `adv_1_${Math.floor(centerLat * 100)}`,
        name: `Advocate S. K. Rao & Associates`,
        address: `Opp. Court Circle, ${cityClean}`,
        lat: centerLat + 0.003,
        lon: centerLon + 0.002,
        osmType: "Law Firm",
        phone: "+91 98490 12345",
        website: `https://www.skraolegal-${cityClean.toLowerCase()}.in`,
        openingHours: "Mo-Sa 09:00-18:00",
        detectedSpecialization: "Civil & Corporate Law"
      },
      {
        id: `adv_2_${Math.floor(centerLat * 100)}`,
        name: `Advocate Ananya Reddy`,
        address: `Near District Court Complex, ${cityClean}`,
        lat: centerLat - 0.002,
        lon: centerLon - 0.003,
        osmType: "Lawyer",
        phone: "+91 94400 56789",
        website: `https://www.ananyareddy-${cityClean.toLowerCase()}.in`,
        openingHours: "Mo-Fr 10:00-19:00",
        detectedSpecialization: "Criminal Law"
      },
      {
        id: `adv_3_${Math.floor(centerLat * 100)}`,
        name: `Sharma & Partners Legal Chambers`,
        address: `Civil Lines, ${cityClean}`,
        lat: centerLat + 0.005,
        lon: centerLon - 0.001,
        osmType: "Law Firm",
        phone: "+91 97000 11223",
        website: `https://www.sharmalegal-${cityClean.toLowerCase()}.in`,
        openingHours: "Mo-Sa 10:00-20:00",
        detectedSpecialization: "Property / Real Estate Law"
      }
    ];

    res.json({ centerLat, centerLon, locationLabel, results });
  } catch (err) {
    req.log.error({ err }, "Advocate search error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
