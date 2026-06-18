import { useState } from "react";
import { useListAdvocates, getListAdvocatesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Briefcase, Star, Phone, Mail, Map } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const SPECIALIZATIONS = [
  "Civil Law", "Criminal Law", "Corporate Law", "Family Law",
  "Property Law", "Cyber Law", "Consumer Law", "Employment Law"
];

function openMapsForAdvocate(name: string, city: string, specialization: string) {
  const query = encodeURIComponent(`${specialization} lawyer ${name} ${city}`);
  window.open(`https://www.google.com/maps/search/${query}`, "_blank");
}

function openMapsSearch(location: string, specialization: string) {
  const spec = specialization && specialization !== "all" ? specialization : "lawyer";
  const loc = location.trim() || "near me";
  const query = encodeURIComponent(`${spec} ${loc}`);
  window.open(`https://www.google.com/maps/search/${query}`, "_blank");
}

export default function AdvocatesPage() {
  const [location, setLocation] = useState("");
  const [specialization, setSpecialization] = useState("all");
  const [minRating, setMinRating] = useState("all");

  const filterParams = {
    location: location || undefined,
    specialization: specialization !== "all" ? specialization : undefined,
    minRating: minRating !== "all" ? parseFloat(minRating) : undefined,
  };

  const { data: advocates = [], isLoading } = useListAdvocates(filterParams, {
    query: { queryKey: getListAdvocatesQueryKey(filterParams) }
  });

  const handleSearch = () => {
    openMapsSearch(location, specialization);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Advocate Directory</h1>
        <p className="text-muted-foreground">Find top-rated legal professionals tailored to your specific needs.</p>
      </div>

      <Card className="bg-muted/30 border-muted">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="City or leave blank for nearby..."
                  className="pl-9"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Specialization</label>
              <Select value={specialization} onValueChange={setSpecialization}>
                <SelectTrigger>
                  <SelectValue placeholder="All Practices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Practices</SelectItem>
                  {SPECIALIZATIONS.map(spec => (
                    <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Minimum Rating</label>
              <Select value={minRating} onValueChange={setMinRating}>
                <SelectTrigger>
                  <SelectValue placeholder="Any rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any rating</SelectItem>
                  <SelectItem value="4.0">4.0+ Stars</SelectItem>
                  <SelectItem value="4.5">4.5+ Stars</SelectItem>
                  <SelectItem value="4.8">4.8+ Stars</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button className="flex-1" onClick={handleSearch}>
                <Map className="w-4 h-4 mr-2" /> Find on Maps
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Clicking "Find on Maps" opens Google Maps to locate lawyers near you. Directory below shows our registered advocates.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 h-48 bg-muted/20" />
            </Card>
          ))}
        </div>
      ) : advocates.length === 0 ? (
        <div className="text-center p-12 border rounded-lg bg-muted/10">
          <Search className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">No advocates found</h3>
          <p className="text-muted-foreground text-sm mb-4">Try adjusting your filters, or search Google Maps for lawyers nearby.</p>
          <Button variant="outline" onClick={() => openMapsSearch(location, specialization)}>
            <Map className="w-4 h-4 mr-2" /> Search Lawyers on Google Maps
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {advocates.map((advocate) => (
            <Card key={advocate.id} className="overflow-hidden hover:shadow-md transition-shadow group">
              <CardContent className="p-0">
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-4">
                      <Avatar className="h-14 w-14 border-2 border-background shadow-sm">
                        <AvatarFallback className="bg-primary/10 text-primary font-bold font-serif text-lg">
                          {advocate.name.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-bold text-foreground text-lg leading-tight group-hover:text-primary transition-colors">{advocate.name}</h3>
                        <p className="text-primary text-sm font-medium">{advocate.specialization}</p>
                      </div>
                    </div>
                    {advocate.available && (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                        Available
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2 mt-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>{advocate.city}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 shrink-0" />
                      <span>{advocate.experience} years experience</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 shrink-0 text-amber-500 fill-amber-500" />
                      <span className="font-medium text-foreground">{advocate.rating}</span>
                      <span className="text-xs">rating</span>
                    </div>
                  </div>

                  {advocate.bio && (
                    <p className="text-sm mt-4 line-clamp-2 text-muted-foreground">{advocate.bio}</p>
                  )}

                  {(advocate.phone || advocate.email) && (
                    <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                      {advocate.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3 h-3" /><span>{advocate.phone}</span>
                        </div>
                      )}
                      {advocate.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3 h-3" /><span>{advocate.email}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-muted/30 px-6 py-3 border-t flex items-center justify-between">
                  <div className="font-semibold text-foreground">
                    ₹{advocate.consultationFee} <span className="text-xs font-normal text-muted-foreground">/ consultation</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => openMapsForAdvocate(advocate.name, advocate.city, advocate.specialization)}
                  >
                    <MapPin className="w-3.5 h-3.5 mr-1.5" /> Locate
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
