/**
 * Nominatim（OpenStreetMap）で住所 → 緯度経度。
 * 利用ポリシー: https://operations.osmfoundation.org/policies/nominatim/
 */
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';

export async function geocodeAddressServer(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = address.trim();
  if (!q) return null;

  try {
    const url = `${NOMINATIM_SEARCH}?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=jp`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'LapinReformMobile/1.0 (internal geocode on project register)',
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!resp.ok) {
      console.warn('[geocode-server] Nominatim HTTP', resp.status);
      return null;
    }
    const results = (await resp.json()) as { lat?: string; lon?: string }[];
    if (!Array.isArray(results) || results.length === 0) return null;
    const lat = Number(results[0].lat);
    const lng = Number(results[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  } catch (e) {
    console.error('[geocode-server]', e);
    return null;
  }
}
