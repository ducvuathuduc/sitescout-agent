/**
 * Pure geometry helpers shared by the CLI (Node) and the Worker (edge).
 * No network, no dependencies — safe in any JS runtime.
 */
export interface LatLon {
  lat: number;
  lon: number;
}

const R = 6_371_008.8; // mean Earth radius (m)
const rad = (d: number): number => (d * Math.PI) / 180;

/** Move a point by dx (east, m) and dy (north, m). */
export function offset(p: LatLon, dxM: number, dyM: number): LatLon {
  const lat = p.lat + (dyM / R) * (180 / Math.PI);
  const lon = p.lon + (dxM / (R * Math.cos(rad(p.lat)))) * (180 / Math.PI);
  return { lat: round6(lat), lon: round6(lon) };
}

export function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** Great-circle distance in metres. */
export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Centre + one hexagonal ring (6 points) at `spacingM` — 7 candidates. */
export function hexRing(center: LatLon, spacingM: number): LatLon[] {
  const out: LatLon[] = [{ lat: round6(center.lat), lon: round6(center.lon) }];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k;
    out.push(offset(center, spacingM * Math.cos(a), spacingM * Math.sin(a)));
  }
  return out;
}

/**
 * Hexagonal lattice covering a bbox [minLon, minLat, maxLon, maxLat],
 * `spacingM` apart. Used to seed candidate cells inside an area.
 */
export function hexGrid(
  bbox: [number, number, number, number],
  spacingM: number,
  maxPoints = 400,
): LatLon[] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const sw = { lat: minLat, lon: minLon };
  const widthM = haversineM(sw, { lat: minLat, lon: maxLon });
  const heightM = haversineM(sw, { lat: maxLat, lon: minLon });
  const rowH = spacingM * Math.sqrt(3) / 2;
  const pts: LatLon[] = [];
  for (let r = 0, y = 0; y <= heightM; r++, y = r * rowH) {
    for (let x = r % 2 ? spacingM / 2 : 0; x <= widthM; x += spacingM) {
      pts.push(offset(sw, x, y));
      if (pts.length >= maxPoints) return pts;
    }
  }
  return pts;
}

type Ring = number[][];
type PolyCoords = Ring[];

/** Ray-casting point-in-polygon for GeoJSON Polygon / MultiPolygon. */
export function pointInGeometry(
  p: LatLon,
  g: { type: string; coordinates: unknown } | null | undefined,
): boolean {
  if (!g) return false;
  const polys: PolyCoords[] =
    g.type === "Polygon"
      ? [g.coordinates as PolyCoords]
      : g.type === "MultiPolygon"
        ? (g.coordinates as PolyCoords[])
        : [];
  return polys.some((poly) => {
    if (!inRing(p, poly[0])) return false;
    return !poly.slice(1).some((hole) => inRing(p, hole));
  });
}

function inRing(p: LatLon, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Geodesic-ish polygon area (m²) — spherical excess approximation. */
export function geometryAreaM2(g: { type: string; coordinates: unknown } | null | undefined): number {
  if (!g) return 0;
  const polys: PolyCoords[] =
    g.type === "Polygon"
      ? [g.coordinates as PolyCoords]
      : g.type === "MultiPolygon"
        ? (g.coordinates as PolyCoords[])
        : [];
  let total = 0;
  for (const poly of polys) {
    poly.forEach((ring, i) => {
      const a = Math.abs(ringArea(ring));
      total += i === 0 ? a : -a;
    });
  }
  return total;
}

function ringArea(ring: Ring): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)));
  }
  return (area * R * R) / 2;
}

/** Bounding box of a GeoJSON geometry. */
export function geometryBbox(g: { type: string; coordinates: unknown }): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(g.coordinates);
  return [minX, minY, maxX, maxY];
}
