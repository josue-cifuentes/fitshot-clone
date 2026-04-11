import polyline from "@mapbox/polyline";

/**
 * Decode Strava `map.summary_polyline` into flat [x,y,x,y,...] points
 * fitted to a local pixel box (for Konva `Line`).
 */
export function summaryPolylineToFlatPoints(
  summaryPolyline: string | undefined,
  width: number,
  height: number,
  pad: number
): number[] {
  if (!summaryPolyline?.trim()) return [];

  const decoded = polyline.decode(summaryPolyline) as [number, number][];
  if (decoded.length < 2) return [];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of decoded) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }

  const latPad = Math.max((maxLat - minLat) * 0.1, 0.0001);
  const lngPad = Math.max((maxLng - minLng) * 0.1, 0.0001);
  minLat -= latPad;
  maxLat += latPad;
  minLng -= lngPad;
  maxLng += lngPad;

  const innerW = Math.max(width - 2 * pad, 1);
  const innerH = Math.max(height - 2 * pad, 1);
  const latRange = maxLat - minLat;
  const lngRange = maxLng - minLng;

  const flat: number[] = [];
  for (const [lat, lng] of decoded) {
    const x = pad + ((lng - minLng) / lngRange) * innerW;
    const y = pad + (1 - (lat - minLat) / latRange) * innerH;
    flat.push(x, y);
  }
  return flat;
}
