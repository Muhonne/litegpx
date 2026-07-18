import { normalizeSearchText } from "../lib/format.js";

const PLACE_INDEX = [
  { name: "Helsinki", aliases: ["helsingfors"], center: [24.9384, 60.1699] },
  { name: "Espoo", aliases: ["esbo"], center: [24.6559, 60.2055] },
  { name: "Vantaa", aliases: ["vanda"], center: [25.0378, 60.2941] },
  { name: "Turku", aliases: ["abo", "åbo"], center: [22.2666, 60.4518] },
  { name: "Tampere", aliases: ["tammerfors"], center: [23.7610, 61.4978] },
  { name: "Lahti", aliases: ["lahtis"], center: [25.6615, 60.9827] },
  { name: "Hämeenlinna", aliases: ["hameenlinna", "tavastehus"], center: [24.4643, 60.9959] },
  { name: "Porvoo", aliases: ["borga", "borgå"], center: [25.6651, 60.3932] },
  { name: "Kotka", aliases: [], center: [26.9459, 60.4664] },
  { name: "Kouvola", aliases: [], center: [26.7042, 60.8681] },
  { name: "Salo", aliases: [], center: [23.1290, 60.3831] },
  { name: "Lohja", aliases: ["lojo"], center: [24.0653, 60.2486] },
  { name: "Raasepori", aliases: ["raseborg", "tammisaari", "ekenäs", "ekenas"], center: [23.4369, 59.9736] },
];

export function findPlace(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return null;
  return PLACE_INDEX.find((place) => {
    const names = [place.name, ...place.aliases].map(normalizeSearchText);
    return names.some((name) => name === normalized || name.startsWith(normalized));
  }) || null;
}
