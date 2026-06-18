import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Briefcase, Phone, Globe, Navigation, Loader2, Map, AlertCircle, Scale } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lawyer {
  id: number;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  lat: number;
  lon: number;
  osmType: string;
  openingHours?: string;
  detectedSpecialization?: string;
}

// ─── Specialization config ────────────────────────────────────────────────────

const SPECIALIZATIONS = [
  { value: "all", label: "All Types" },
  { value: "civil", label: "Civil Law" },
  { value: "criminal", label: "Criminal Law" },
  { value: "corporate", label: "Corporate / Business Law" },
  { value: "family", label: "Family Law" },
  { value: "property", label: "Property / Real Estate Law" },
  { value: "cyber", label: "Cyber / IT Law" },
  { value: "consumer", label: "Consumer Law" },
  { value: "employment", label: "Employment / Labour Law" },
  { value: "tax", label: "Tax Law" },
  { value: "immigration", label: "Immigration Law" },
  { value: "intellectual property", label: "Intellectual Property" },
  { value: "divorce", label: "Divorce / Matrimonial" },
  { value: "banking", label: "Banking & Finance Law" },
  { value: "environmental", label: "Environmental Law" },
  { value: "human rights", label: "Human Rights Law" },
];

// Keywords to match specialization against OSM name / tag data
const SPEC_KEYWORDS: Record<string, string[]> = {
  civil: ["civil", "civil law", "civil court"],
  criminal: ["criminal", "defence", "defense", "criminal law", "criminal court"],
  corporate: ["corporate", "business", "commercial", "company", "corporate law"],
  family: ["family", "matrimonial", "custody", "adoption", "family law"],
  property: ["property", "real estate", "land", "realty", "conveyancing"],
  cyber: ["cyber", "it law", "technology", "internet", "digital"],
  consumer: ["consumer", "consumer law", "consumer protection"],
  employment: ["employment", "labour", "labor", "hr", "workplace"],
  tax: ["tax", "taxation", "gst", "income tax"],
  immigration: ["immigration", "visa", "citizenship", "passport"],
  "intellectual property": ["intellectual", "ip", "patent", "trademark", "copyright"],
  divorce: ["divorce", "matrimonial", "alimony", "marital"],
  banking: ["banking", "finance", "financial", "bank"],
  environmental: ["environmental", "environment", "green"],
  "human rights": ["human rights", "rights", "civil liberties"],
};

function detectSpecialization(name: string, tags: Record<string, string>): string | undefined {
  const haystack = [
    name,
    tags["specialization"] || "",
    tags["legal:specialization"] || "",
    tags["description"] || "",
    tags["name:en"] || "",
  ].join(" ").toLowerCase();

  for (const [spec, keywords] of Object.entries(SPEC_KEYWORDS)) {
    if (keywords.some(kw => haystack.includes(kw))) {
      return SPECIALIZATIONS.find(s => s.value === spec)?.label || spec;
    }
  }
  return undefined;
}

function matchesSpecialization(lawyer: Lawyer, spec: string): boolean {
  if (spec === "all") return true;
  if (lawyer.detectedSpecialization) {
    return lawyer.detectedSpecialization.toLowerCase().includes(spec) ||
      (SPEC_KEYWORDS[spec] || []).some(kw => lawyer.detectedSpecialization!.toLowerCase().includes(kw));
  }
  const haystack = lawyer.name.toLowerCase() + " " + lawyer.address.toLowerCase();
  return (SPEC_KEYWORDS[spec] || []).some(kw => haystack.includes(kw));
}

// ─── OSM / Overpass helpers ───────────────────────────────────────────────────

async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

async function fetchLawyers(lat: number, lon: number, radiusMeters: number): Promise<Lawyer[]> {
  const query = `
[out:json][timeout:30];
(
  node["office"="lawyer"](around:${radiusMeters},${lat},${lon});
  node["office"="law_firm"](around:${radiusMeters},${lat},${lon});
  node["office"="legal_office"](around:${radiusMeters},${lat},${lon});
  node["office"="legal"](around:${radiusMeters},${lat},${lon});
  node["office"="notary"](around:${radiusMeters},${lat},${lon});
  way["office"="lawyer"](around:${radiusMeters},${lat},${lon});
  way["office"="law_firm"](around:${radiusMeters},${lat},${lon});
  way["office"="legal"](around:${radiusMeters},${lat},${lon});
);
out body center;
`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!res.ok) throw new Error("Overpass API error");
  const data = await res.json();

  return (data.elements as any[])
    .filter((el) => el.tags?.name)
    .map((el) => {
      const t = el.tags || {};
      const addressParts = [
        t["addr:housenumber"],
        t["addr:street"],
        t["addr:suburb"] || t["addr:neighbourhood"],
        t["addr:city"] || t["addr:town"],
        t["addr:state"],
      ].filter(Boolean);

      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;

      const osmType =
        t.office === "law_firm" ? "Law Firm"
        : t.office === "notary" ? "Notary"
        : t.office === "legal" || t.office === "legal_office" ? "Legal Office"
        : "Lawyer";

      return {
        id: el.id,
        name: t.name,
        address: addressParts.length > 0 ? addressParts.join(", ") : "Address not available",
        phone: t.phone || t["contact:phone"],
        website: t.website || t["contact:website"],
        lat: elLat,
        lon: elLon,
        osmType,
        openingHours: t.opening_hours,
        detectedSpecialization: detectSpecialization(t.name, t),
      } as Lawyer;
    })
    .filter((l) => l.lat && l.lon);
}

// ─── Component ────────────────────────────────────────────────────────────────

const RADIUS_OPTIONS = [
  { label: "5 km",  value: "5000"  },
  { label: "10 km", value: "10000" },
  { label: "25 km", value: "25000" },
  { label: "50 km", value: "50000" },
];

const SPEC_BADGE_COLORS: Record<string, string> = {
  "Civil Law":               "bg-blue-500/10 text-blue-700 border-blue-500/20",
  "Criminal Law":            "bg-red-500/10 text-red-700 border-red-500/20",
  "Corporate / Business Law":"bg-purple-500/10 text-purple-700 border-purple-500/20",
  "Family Law":              "bg-pink-500/10 text-pink-700 border-pink-500/20",
  "Property / Real Estate Law":"bg-amber-500/10 text-amber-700 border-amber-500/20",
  "Cyber / IT Law":          "bg-cyan-500/10 text-cyan-700 border-cyan-500/20",
  "Consumer Law":            "bg-green-500/10 text-green-700 border-green-500/20",
  "Employment / Labour Law": "bg-orange-500/10 text-orange-700 border-orange-500/20",
  "Tax Law":                 "bg-lime-500/10 text-lime-700 border-lime-500/20",
  "Immigration Law":         "bg-teal-500/10 text-teal-700 border-teal-500/20",
  "Intellectual Property":   "bg-violet-500/10 text-violet-700 border-violet-500/20",
};

export default function AdvocatesPage() {
  const { toast } = useToast();
  const [cityInput, setCityInput]         = useState("");
  const [radius, setRadius]               = useState("10000");
  const [specialization, setSpecialization] = useState("all");
  const [allLawyers, setAllLawyers]       = useState<Lawyer[]>([]);
  const [loading, setLoading]             = useState(false);
  const [searched, setSearched]           = useState(false);
  const [centerCoords, setCenterCoords]   = useState<{ lat: number; lon: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState("");

  // Client-side filtered list
  const lawyers = specialization === "all"
    ? allLawyers
    : allLawyers.filter(l => matchesSpecialization(l, specialization));

  const runSearch = useCallback(async (lat: number, lon: number, label: string, currentRadius: string) => {
    setLoading(true);
    setSearched(false);
    setCenterCoords({ lat, lon });
    setLocationLabel(label);
    try {
      const results = await fetchLawyers(lat, lon, parseInt(currentRadius));
      setAllLawyers(results);
      setSearched(true);
      if (results.length === 0) {
        toast({ title: "No results", description: "No lawyers found in this area on OpenStreetMap. Try a larger radius." });
      }
    } catch {
      toast({ title: "Search failed", description: "Could not reach the location service. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Not supported", description: "Geolocation is not supported by your browser.", variant: "destructive" });
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
          const data = await res.json();
          const label = data.address?.city || data.address?.town || data.address?.village || "Your Location";
          setCityInput(label);
          await runSearch(lat, lon, label, radius);
        } catch {
          await runSearch(lat, lon, "Your Location", radius);
        }
      },
      () => {
        setLoading(false);
        toast({ title: "Location denied", description: "Allow location access in your browser, or type a city name.", variant: "destructive" });
      }
    );
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityInput.trim()) {
      toast({ title: "Enter a location", description: "Type a city or area to search.", variant: "destructive" });
      return;
    }
    const coords = await geocodeCity(cityInput.trim());
    if (!coords) {
      toast({ title: "Location not found", description: "Could not find that city. Try a different name.", variant: "destructive" });
      return;
    }
    await runSearch(coords.lat, coords.lon, cityInput.trim(), radius);
  };

  const openInMaps = (lawyer: Lawyer) => {
    const q = encodeURIComponent(`${lawyer.name} ${lawyer.address}`);
    window.open(`https://www.google.com/maps/search/${q}/@${lawyer.lat},${lawyer.lon},15z`, "_blank");
  };

  const openAreaInMaps = () => {
    const specLabel = SPECIALIZATIONS.find(s => s.value === specialization)?.label || "lawyer";
    const q = encodeURIComponent(`${specLabel === "All Types" ? "lawyers" : specLabel + " lawyer"} near ${locationLabel || "me"}`);
    const zoom = centerCoords ? `/@${centerCoords.lat},${centerCoords.lon},13z` : "";
    window.open(`https://www.google.com/maps/search/${q}${zoom}`, "_blank");
  };

  const getInitials = (name: string) =>
    name.split(" ").filter(Boolean).map(n => n[0]).join("").substring(0, 2).toUpperCase();

  const specLabel = SPECIALIZATIONS.find(s => s.value === specialization)?.label || "";

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Find Lawyers Nearby</h1>
        <p className="text-muted-foreground">Search real lawyers and legal offices near your location using live map data.</p>
      </div>

      {/* Search panel */}
      <Card className="bg-muted/30 border-muted">
        <CardContent className="p-6 space-y-4">
          <form onSubmit={handleManualSearch}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">

              {/* City input */}
              <div className="sm:col-span-1 lg:col-span-4 space-y-2">
                <label className="text-xs font-medium text-muted-foreground">City / Area</label>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="e.g. Mumbai, Delhi, Bengaluru..."
                    className="pl-9"
                    value={cityInput}
                    onChange={(e) => setCityInput(e.target.value)}
                  />
                </div>
              </div>

              {/* Type of lawyer */}
              <div className="sm:col-span-1 lg:col-span-3 space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Scale className="w-3 h-3" /> Type of Lawyer
                </label>
                <Select value={specialization} onValueChange={setSpecialization}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIALIZATIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Radius */}
              <div className="sm:col-span-1 lg:col-span-2 space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Radius</label>
                <Select value={radius} onValueChange={setRadius}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RADIUS_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Buttons */}
              <div className="sm:col-span-2 lg:col-span-3 flex gap-2 items-end">
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading
                    ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    : <Search className="w-4 h-4 mr-2" />}
                  {loading ? "Searching..." : "Search"}
                </Button>
                <Button type="button" variant="outline" onClick={handleDetectLocation} disabled={loading} title="Detect my location">
                  <Navigation className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </form>

          <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Live data from OpenStreetMap. Hit <Navigation className="w-3 h-3 inline" /> to auto-detect your location.
              {searched && specialization !== "all" && (
                <span className="ml-1 text-primary font-medium">
                  Filtering by: {specLabel}
                </span>
              )}
            </p>
            {searched && (
              <Button variant="outline" size="sm" onClick={openAreaInMaps}>
                <Map className="w-4 h-4 mr-2" /> View All on Google Maps
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 h-52 bg-muted/20" />
            </Card>
          ))}
        </div>
      )}

      {/* No results */}
      {!loading && searched && lawyers.length === 0 && (
        <div className="text-center p-12 border rounded-lg bg-muted/10 border-dashed">
          <Search className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">
            {allLawyers.length > 0
              ? `No ${specLabel} lawyers found in results`
              : "No lawyers found nearby"}
          </h3>
          <p className="text-muted-foreground text-sm mb-4">
            {allLawyers.length > 0
              ? `${allLawyers.length} offices found but none matched "${specLabel}". Try "All Types" or search Google Maps.`
              : "OpenStreetMap has limited coverage in some areas. Try a larger radius or search on Google Maps."}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            {allLawyers.length > 0 && (
              <Button variant="outline" onClick={() => setSpecialization("all")}>
                Show All {allLawyers.length} Results
              </Button>
            )}
            <Button variant="outline" onClick={openAreaInMaps}>
              <Map className="w-4 h-4 mr-2" /> Search on Google Maps
            </Button>
          </div>
        </div>
      )}

      {/* Initial empty state */}
      {!loading && !searched && (
        <div className="text-center p-16 border rounded-lg bg-muted/10 border-dashed">
          <Navigation className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Find real lawyers near you</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
            Select a type of lawyer, enter a city, and click Search — or hit the location icon to auto-detect your position.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button onClick={handleDetectLocation} disabled={loading}>
              <Navigation className="w-4 h-4 mr-2" /> Detect My Location
            </Button>
            <Button variant="outline" onClick={openAreaInMaps}>
              <Map className="w-4 h-4 mr-2" /> Open Google Maps
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && lawyers.length > 0 && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              Showing <strong>{lawyers.length}</strong>
              {specialization !== "all" && allLawyers.length !== lawyers.length
                ? ` ${specLabel}`
                : ""}
              {" "}result{lawyers.length !== 1 ? "s" : ""} within{" "}
              {RADIUS_OPTIONS.find(o => o.value === radius)?.label} of <strong>{locationLabel}</strong>
              {specialization !== "all" && allLawyers.length !== lawyers.length && (
                <span className="text-muted-foreground"> ({allLawyers.length} total, filtered)</span>
              )}
            </p>
            {specialization !== "all" && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSpecialization("all")}>
                Clear filter
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lawyers.map((lawyer) => (
              <Card key={lawyer.id} className="overflow-hidden hover:shadow-md transition-shadow group">
                <CardContent className="p-0">
                  <div className="p-6">
                    <div className="flex gap-4 mb-3">
                      <Avatar className="h-12 w-12 border-2 border-background shadow-sm shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary font-bold font-serif">
                          {getInitials(lawyer.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <h3
                          className="font-bold text-foreground leading-tight group-hover:text-primary transition-colors truncate"
                          title={lawyer.name}
                        >
                          {lawyer.name}
                        </h3>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {/* OSM type badge */}
                          <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/20 text-primary px-1.5 py-0">
                            {lawyer.osmType}
                          </Badge>
                          {/* Detected specialization badge */}
                          {lawyer.detectedSpecialization && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${SPEC_BADGE_COLORS[lawyer.detectedSpecialization] || "bg-muted text-muted-foreground"}`}
                            >
                              {lawyer.detectedSpecialization}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{lawyer.address}</span>
                      </div>
                      {lawyer.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 shrink-0" />
                          <a href={`tel:${lawyer.phone}`} className="hover:text-primary transition-colors">
                            {lawyer.phone}
                          </a>
                        </div>
                      )}
                      {lawyer.website && (
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 shrink-0" />
                          <a
                            href={lawyer.website.startsWith("http") ? lawyer.website : `https://${lawyer.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary transition-colors truncate"
                          >
                            {lawyer.website.replace(/^https?:\/\//, "")}
                          </a>
                        </div>
                      )}
                      {lawyer.openingHours && (
                        <div className="flex items-start gap-2">
                          <Briefcase className="w-4 h-4 shrink-0 mt-0.5" />
                          <span className="text-xs">{lawyer.openingHours}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-muted/30 px-6 py-3 border-t flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {lawyer.lat.toFixed(4)}, {lawyer.lon.toFixed(4)}
                    </span>
                    <Button size="sm" onClick={() => openInMaps(lawyer)} className="shrink-0">
                      <Map className="w-3.5 h-3.5 mr-1.5" /> View on Maps
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
