#!/usr/bin/env python3
import difflib
import html
import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTES_DIR = ROOT / "app/src/main/assets/routes"
CATALOG_PATH = ROUTES_DIR / "routes.json"
BIKELAND_API = "https://www.bikeland.fi/wp-json/wp/v2/routes"
BIKELAND_GPX = "https://www.bikeland.fi/wp-admin/admin-ajax.php?action=loadGPXFile&id={id}&lang=fi"

REQUESTED_ROUTES = [
    {"title": "Hartola-Vuorenkylä-Hartola rengasreitti.", "lengthKm": 57, "durationText": "--"},
    {"title": "Häme by Cycle: Evon vihreän kullan kierros", "lengthKm": 35, "durationText": "3.5 - 5 tuntia"},
    {"title": "Hämeen Härkätie", "lengthKm": 70, "durationText": "13 - tuntia"},
    {"title": "Hämeen Ilvesreitti Hattula maastopyöräilyreitti 18km", "lengthKm": 18, "durationText": "2 - 4 tuntia"},
    {"title": "Häähninmäen maastopyöräilyreitti", "lengthKm": 33, "durationText": "2.5 - 4 tuntia"},
    {"title": "Ilomantsijärven sorakierros", "lengthKm": 54, "durationText": "3 - 4 tuntia"},
    {"title": "Jokimaisemat, hedelmälliset tasangot ja ruisviski", "lengthKm": 99, "durationText": "5 - 8 tuntia"},
    {"title": "Kalvolan Kirkkopolku", "lengthKm": 51, "durationText": "4 - 7 tuntia"},
    {"title": "Kolin Kansallispuistolenkki", "lengthKm": 19, "durationText": "1 - 1.5 tuntia"},
    {"title": "Kolkin kartanon soratielenkki", "lengthKm": 27, "durationText": "60 - 150 minuuttia"},
    {"title": "Kuopion pohjoinen pyöräreitti", "lengthKm": 20, "durationText": "1 - 1.5 tuntia"},
    {"title": "Lintusyrjänharjun luontopolku mtb", "lengthKm": 5, "durationText": "15 - 20 minuuttia"},
    {"title": "Loimaalaista maalaismaisemaa", "lengthKm": 41, "durationText": "--"},
    {"title": "Loimaalla Alpo Jaakolan jäljillä", "lengthKm": 37, "durationText": "--"},
    {"title": "Loimaan Jokivarsikierros", "lengthKm": 37, "durationText": "--"},
    {"title": "Luonnonläheinen lenkki, aktiviteetit ja nähtävyydet", "lengthKm": 15, "durationText": "1 - 2 tuntia"},
    {"title": "Lähdekorven MTB-lenkki", "lengthKm": 10, "durationText": "--"},
    {"title": "Meteoriittikraatteri ja maaseutu", "lengthKm": 47, "durationText": "2.5 - 5 tuntia"},
    {"title": "Nuha - Pokela maastopyöräreitti", "lengthKm": 32, "durationText": "3 - 4 tuntia"},
    {"title": "Saimaa by Cycle Gravel: Hummon hurautus", "lengthKm": 74, "durationText": "4 - 6 tuntia"},
    {"title": "Saimaa by Cycle Gravel: Luostarien kierros", "lengthKm": 31, "durationText": "3 - 5 tuntia"},
    {"title": "Savo Gravel: Kärkkäälän kierros", "lengthKm": 46, "durationText": "2 - 4 tuntia"},
    {"title": "Savo Gravel: Myhinkosken kierros", "lengthKm": 43, "durationText": "2 - 4 tuntia"},
    {"title": "Savo Gravel: Oinaskylän kierros", "lengthKm": 42, "durationText": "2 - 4 tuntia"},
    {"title": "Savo Gravel: Pielaveden pohjoinen kierros", "lengthKm": 55, "durationText": "2 - 5 tuntia"},
    {"title": "Savo Gravel: Säviän kierros", "lengthKm": 46, "durationText": "2 - 5 tuntia"},
    {"title": "Savo Gravel: Vesantojärven ympäri", "lengthKm": 47, "durationText": "2 - 5 tuntia"},
    {"title": "Sorapolkaisu Puu-Juukaan", "lengthKm": 103, "durationText": "5 - 10 tuntia"},
    {"title": "Strömsö on totta - ja löytyy Vaasasta!", "lengthKm": 25, "durationText": "1.5 - 3 tuntia"},
    {"title": "Uniikki maailmanperintöluonto Merenkurkun saaristossa", "lengthKm": 89, "durationText": "4 - 7 tuntia"},
    {"title": "Vaasan historia ja lähiluonto", "lengthKm": 28, "durationText": "1.5 - 3 tuntia"},
    {"title": "Vaasan historia ja tulevaisuus", "lengthKm": 41, "durationText": "2 - 4 tuntia"},
]

ALIASES = {
    "Hartola-Vuorenkylä-Hartola rengasreitti.": ["Hartola-Vuorenkylä-Hartola rengasreitti"],
    "Häähninmäen maastopyöräilyreitti": ["Häähninmäen maastopyöräilyreitit"],
    "Strömsö on totta - ja löytyy Vaasasta!": ["Strömsö on totta – ja löytyy Vaasasta"],
}


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "LiteGPX route catalog builder"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read().decode("utf-8")), response.headers


def fetch_bytes(url):
    request = urllib.request.Request(url, headers={"User-Agent": "LiteGPX route catalog builder"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def normalize(value):
    value = html.unescape(value).lower().replace("–", "-")
    value = re.sub(r"[^a-zåäö0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def slugify(value):
    value = normalize(value)
    value = value.replace("å", "a").replace("ä", "a").replace("ö", "o").replace(" ", "-")
    return re.sub(r"[^a-z0-9-]+", "", value).strip("-")


def route_title(route):
    return html.unescape(route.get("title", {}).get("rendered", "")).strip()


def fetch_all_bikeland_routes():
    routes = []
    page = 1
    total_pages = None
    while total_pages is None or page <= total_pages:
        query = urllib.parse.urlencode(
            {
                "per_page": 100,
                "page": page,
                "_fields": "id,slug,link,title,route_data",
            }
        )
        payload, headers = fetch_json(f"{BIKELAND_API}?{query}")
        routes.extend(payload)
        total_pages = int(headers.get("X-WP-TotalPages", page))
        page += 1
    return routes


def score_route(requested, candidate):
    requested_names = [requested["title"], *ALIASES.get(requested["title"], [])]
    candidate_names = [route_title(candidate), candidate.get("slug", "")]
    best = 0.0
    for left in requested_names:
        for right in candidate_names:
            left_n = normalize(left)
            right_n = normalize(right)
            ratio = difflib.SequenceMatcher(None, left_n, right_n).ratio()
            if left_n and left_n in right_n:
                ratio = max(ratio, 0.96)
            if right_n and right_n in left_n:
                ratio = max(ratio, 0.92)
            best = max(best, ratio)
    return best


def parse_bounds(gpx_bytes):
    root = ET.fromstring(gpx_bytes)
    points = []
    for element in root.iter():
        if element.tag.endswith("trkpt"):
            points.append((float(element.attrib["lon"]), float(element.attrib["lat"])))
    if len(points) < 2:
        raise ValueError("GPX has fewer than 2 track points")
    lons = [point[0] for point in points]
    lats = [point[1] for point in points]
    return {
        "minLon": min(lons),
        "minLat": min(lats),
        "maxLon": max(lons),
        "maxLat": max(lats),
        "trackPointCount": len(points),
    }


def main():
    ROUTES_DIR.mkdir(parents=True, exist_ok=True)
    candidates = fetch_all_bikeland_routes()
    used_ids = set()
    catalog = []

    for requested in REQUESTED_ROUTES:
        ranked = sorted(
            ((score_route(requested, route), route) for route in candidates if route["id"] not in used_ids),
            reverse=True,
            key=lambda item: item[0],
        )
        score, route = ranked[0]
        slug = slugify(requested["title"])
        gpx_name = f"{slug}.gpx"
        download_url = BIKELAND_GPX.format(id=route["id"])

        entry = {
            "id": slug,
            "title": requested["title"],
            "lengthKm": requested["lengthKm"],
            "durationText": requested["durationText"],
            "source": "Bikeland",
            "matchScore": round(score, 3),
            "bikelandId": None,
            "matchedTitle": None,
            "detailUrl": None,
            "gpxDownloadUrl": None,
            "gpxAsset": None,
            "bounds": None,
            "trackPointCount": 0,
        }

        if score < 0.78:
            catalog.append(entry)
            continue

        gpx_bytes = fetch_bytes(download_url)
        parsed = parse_bounds(gpx_bytes)
        (ROUTES_DIR / gpx_name).write_bytes(gpx_bytes)
        used_ids.add(route["id"])
        entry.update(
            {
                "bikelandId": route["id"],
                "matchedTitle": route_title(route),
                "detailUrl": route["link"],
                "gpxDownloadUrl": download_url,
                "gpxAsset": f"routes/{gpx_name}",
                "bounds": {k: parsed[k] for k in ("minLon", "minLat", "maxLon", "maxLat")},
                "trackPointCount": parsed["trackPointCount"],
            }
        )
        catalog.append(entry)
        time.sleep(0.05)

    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    resolved = sum(1 for item in catalog if item["gpxAsset"])
    print(f"Wrote {CATALOG_PATH.relative_to(ROOT)} with {resolved}/{len(catalog)} Bikeland GPX assets")
    for item in catalog:
        status = "ok" if item["gpxAsset"] else "missing"
        print(f"{status:7} {item['matchScore']:.3f} {item['title']} -> {item['matchedTitle']}")


if __name__ == "__main__":
    main()
