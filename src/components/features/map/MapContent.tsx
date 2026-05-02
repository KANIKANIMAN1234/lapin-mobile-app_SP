'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@/lib/supabase';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const STATUS_COLORS: Record<string, string> = {
  completed: '#059669',
  in_progress: '#2563eb',
  estimate: '#d97706',
  contract: '#7c3aed',
  followup_status: '#f97316',
  inquiry: '#eab308',
  lost: '#9ca3af',
};

const STATUS_CHARS: Record<string, string> = {
  completed: '完',
  in_progress: '施',
  estimate: '見',
  contract: '受',
  followup_status: '追',
  inquiry: '問',
  lost: '失',
};

export interface MapCustomer {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  lastWork: string;
  address?: string;
  assignedTo?: string;
  thumbnailUrl?: string;
}

function createCustomIcon(status: string, name: string, editMode = false, saving = false) {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  const char = STATUS_CHARS[status] ?? '?';
  const displayName = name.length > 8 ? name.slice(0, 8) + '…' : name;

  const border = editMode
    ? saving
      ? '2px dashed #ef4444'
      : '2px dashed #2563eb'
    : '1.5px solid #e5e7eb';

  const html = `
    <div style="
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: white;
      border: ${border};
      border-radius: 20px;
      padding: 4px 8px 4px 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      white-space: nowrap;
      cursor: ${editMode ? 'grab' : 'pointer'};
    ">
      <div style="
        width: 26px; height: 26px;
        border-radius: 50%;
        background: ${saving ? '#9ca3af' : color};
        color: white;
        font-size: 12px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      ">${saving ? '…' : char}</div>
      <span style="font-size: 12px; font-weight: 600; color: #1f2937;">${displayName}</span>
      ${
        editMode
          ? `<span style="font-size: 13px; color: #2563eb; line-height: 1;" title="ドラッグして移動">&#8597;</span>`
          : `<span style="font-size: 13px; color: #9ca3af; line-height: 1;">&#128100;</span>`
      }
    </div>
    <div style="
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      width: 0; height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid white;
      filter: drop-shadow(0 2px 1px rgba(0,0,0,0.1));
    "></div>
  `;

  return L.divIcon({
    className: '',
    html,
    iconSize: undefined,
    iconAnchor: [60, 44],
  });
}

function createLocationPinIcon(label: string): L.DivIcon {
  const isClockIn = label.includes('出勤');
  const color = isClockIn ? '#16a34a' : '#dc2626';
  const shadow = isClockIn ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.4)';
  const icon = isClockIn ? 'login' : 'logout';
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      <div style="
        width:40px;height:40px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        background:${color};border:3px solid white;
        box-shadow:0 3px 12px ${shadow};
        display:flex;align-items:center;justify-content:center;
      ">
        <span class="material-icons" style="
          transform:rotate(45deg);font-size:18px;color:white;
          font-family:'Material Icons',sans-serif;
        ">${icon}</span>
      </div>
      <div style="
        background:${color};color:white;font-size:10px;font-weight:700;
        padding:2px 8px;border-radius:10px;white-space:nowrap;
        box-shadow:0 2px 6px ${shadow};margin-top:-2px;
      ">${label}</div>
    </div>
  `;
  return L.divIcon({ className: '', html, iconSize: undefined, iconAnchor: [20, 52] });
}

function MapCenterUpdater({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (zoom != null) {
      map.flyTo(center, zoom, { animate: true, duration: 0.8 });
    } else {
      map.setView(center, map.getZoom());
    }
  }, [center, zoom, map]);
  return null;
}

/** MapContainer の center は初回マウントのみ有効なため、明示センター無しでマーカーが揃ったら表示域を合わせる */
function FitMarkersOnLoad({
  markers,
  skip,
}: {
  markers: MapCustomer[];
  skip: boolean;
}) {
  const map = useMap();
  const didFit = useRef(false);
  useEffect(() => {
    if (skip || markers.length === 0 || didFit.current) return;
    didFit.current = true;
    const run = () => {
      if (markers.length === 1) {
        map.setView([markers[0].lat, markers[0].lng], 14);
        return;
      }
      const b = L.latLngBounds(markers.map((c) => [c.lat, c.lng] as [number, number]));
      if (b.isValid()) map.fitBounds(b, { padding: [48, 48], maxZoom: 15 });
    };
    run();
    requestAnimationFrame(() => {
      map.invalidateSize();
      run();
    });
  }, [markers, skip, map]);
  return null;
}

/** モバイルでコンテナサイズ確定後にタイル欠けを防ぐ */
function MapResizeInvalidate() {
  const map = useMap();
  useEffect(() => {
    const iv = () => map.invalidateSize();
    const t = window.setTimeout(iv, 50);
    const t2 = window.setTimeout(iv, 300);
    window.addEventListener('orientationchange', iv);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(iv) : null;
    const el = map.getContainer();
    ro?.observe(el);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      window.removeEventListener('orientationchange', iv);
      ro?.disconnect();
    };
  }, [map]);
  return null;
}

async function geocodeAddress(address: string): Promise<[number, number] | null> {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { 'User-Agent': 'lapin-reform-mobile/1.0' } }
    );
    const results = await resp.json();
    if (results.length > 0) return [Number(results[0].lat), Number(results[0].lon)];
    return null;
  } catch {
    return null;
  }
}

function googleMapsUrl(customer: MapCustomer): string {
  const q =
    customer.address && customer.address.trim().length > 0
      ? customer.address
      : `${customer.lat},${customer.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

interface MapContentProps {
  selectedCustomer: MapCustomer | null;
  onSelectCustomer: (customer: MapCustomer | null) => void;
  center?: [number, number];
  centerZoom?: number;
  filterMyOnly?: boolean;
  currentUserId?: string;
  focusProjectId?: string;
  onFocusResolved?: (customer: MapCustomer, coords: [number, number]) => void;
  onGeocodingProgress?: (remaining: number) => void;
  editMode?: boolean;
  onPositionSaved?: (name: string) => void;
  onPositionError?: (name: string) => void;
  locationPin?: [number, number];
  locationPinLabel?: string;
}

function MapContent({
  selectedCustomer,
  onSelectCustomer,
  center,
  centerZoom,
  filterMyOnly,
  currentUserId,
  focusProjectId,
  onFocusResolved,
  onGeocodingProgress,
  editMode = false,
  onPositionSaved,
  locationPin,
  locationPinLabel = '位置情報',
  onPositionError,
}: MapContentProps) {
  const [customers, setCustomers] = useState<MapCustomer[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const geocodingRef = useRef(false);

  useEffect(() => {
    if (geocodingRef.current) return;
    geocodingRef.current = true;

    const supabase = createClient();
    const SELECT = 'id, customer_name, lat, lng, status, work_type, inquiry_date, address, assigned_to';

    (async () => {
      const { data: withCoords, error: e1 } = await supabase
        .from('t_projects')
        .select(SELECT)
        .is('deleted_at', null)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .limit(500);

      if (e1) console.error('[Map] fetch withCoords error:', e1);
      const mapped = (withCoords ?? []).map(toMapCustomer);
      setCustomers(mapped);

      let focusDone = false;
      const fid = focusProjectId ? String(focusProjectId) : '';

      if (fid && onFocusResolved) {
        const target = mapped.find((c) => c.id === fid);
        if (target) {
          onFocusResolved(target, [target.lat, target.lng]);
          focusDone = true;
        }
      }

      // focus 指定案件が一覧に無い（座標未定義・RLSで未取得など）場合は1件取得してジオコード優先
      if (fid && !focusDone) {
        const { data: focusRow } = await supabase
          .from('t_projects')
          .select(SELECT)
          .eq('id', fid)
          .is('deleted_at', null)
          .maybeSingle();

        if (focusRow) {
          const row = focusRow as {
            id: string | number;
            customer_name: string;
            lat: number | null;
            lng: number | null;
            status: string;
            work_type: string[] | string | null;
            inquiry_date: string | null;
            address: string | null;
            assigned_to: string | number | null;
          };
          if (row.lat != null && row.lng != null) {
            const mc = toMapCustomer({
              ...row,
              lat: Number(row.lat),
              lng: Number(row.lng),
            });
            setCustomers((prev) => (prev.some((p) => p.id === mc.id) ? prev : [...prev, mc]));
            onFocusResolved?.(mc, [mc.lat, mc.lng]);
            focusDone = true;
          } else if (row.address && String(row.address).trim().length > 3) {
            await new Promise((r) => setTimeout(r, 1100));
            const coords = await geocodeAddress(String(row.address));
            if (coords) {
              const [lat, lng] = coords;
              const saveRes = await fetch('/api/save-geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: row.id, lat, lng }),
              });
              if (saveRes.ok) {
                const mc = toMapCustomer({ ...row, lat, lng });
                setCustomers((prev) => {
                  const rest = prev.filter((p) => p.id !== mc.id);
                  return [...rest, mc];
                });
                onFocusResolved?.(mc, [lat, lng]);
                focusDone = true;
              }
            }
          }
        }
      }

      const { data: needGeocode, error: e2 } = await supabase
        .from('t_projects')
        .select(SELECT)
        .is('deleted_at', null)
        .is('lat', null)
        .not('address', 'is', null)
        .limit(200);

      if (e2) console.error('[Map] fetch needGeocode error:', e2);
      const toGeocode = (needGeocode ?? []).filter(
        (p) =>
          p.address &&
          String(p.address).trim().length > 3 &&
          String(p.id) !== fid
      );

      if (toGeocode.length === 0) return;

      onGeocodingProgress?.(toGeocode.length);
      let remaining = toGeocode.length;

      for (const p of toGeocode) {
        await new Promise((r) => setTimeout(r, 1100));
        const coords = await geocodeAddress(p.address as string);
        remaining -= 1;
        onGeocodingProgress?.(remaining);

        if (coords) {
          const [lat, lng] = coords;
          const saveRes = await fetch('/api/save-geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: p.id, lat, lng }),
          });
          if (!saveRes.ok) {
            const err = await saveRes.json().catch(() => ({}));
            console.error('[Map] lat/lng save error:', err);
          } else {
            setCustomers((prev) => [...prev, toMapCustomer({ ...p, lat, lng })]);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkerClick = useCallback(
    (customer: MapCustomer) => {
      if (editMode) return;
      onSelectCustomer(selectedCustomer?.id === customer.id ? null : customer);
    },
    [selectedCustomer?.id, onSelectCustomer, editMode]
  );

  const handleDragEnd = useCallback(
    async (customer: MapCustomer, e: L.LeafletEvent) => {
      const { lat, lng } = (e.target as L.Marker).getLatLng();
      setSavingId(customer.id);
      try {
        const saveRes = await fetch('/api/save-geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: customer.id, lat, lng }),
        });
        if (!saveRes.ok) throw new Error('save failed');
        setCustomers((prev) =>
          prev.map((c) => (c.id === customer.id ? { ...c, lat, lng } : c))
        );
        onPositionSaved?.(customer.name);
      } catch {
        onPositionError?.(customer.name);
      } finally {
        setSavingId(null);
      }
    },
    [onPositionSaved, onPositionError]
  );

  const defaultCenter: [number, number] =
    customers.length > 0 ? [customers[0].lat, customers[0].lng] : [35.853, 139.412];

  const mapCenter = center ?? defaultCenter;
  const hasExplicitCenter = Boolean(center);

  const displayCustomers =
    filterMyOnly && currentUserId
      ? customers.filter((c) => c.assignedTo === currentUserId)
      : customers;

  return (
    <MapContainer
      center={mapCenter}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
      className="z-0"
    >
      <MapResizeInvalidate />
      <FitMarkersOnLoad markers={displayCustomers} skip={hasExplicitCenter} />
      <TileLayer
        attribution='&copy; Google'
        url="https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        subdomains={['0', '1', '2', '3']}
        maxZoom={22}
      />
      {center && <MapCenterUpdater center={center} zoom={centerZoom} />}
      {locationPin && (
        <Marker position={locationPin} icon={createLocationPinIcon(locationPinLabel)}>
          <Popup>
            <div className="text-sm font-bold">{locationPinLabel}</div>
            <div className="text-xs text-gray-500 mt-1">
              {locationPin[0].toFixed(6)}, {locationPin[1].toFixed(6)}
            </div>
          </Popup>
        </Marker>
      )}
      {displayCustomers.map((customer) => (
        <Marker
          key={customer.id}
          position={[customer.lat, customer.lng]}
          icon={createCustomIcon(
            customer.status,
            customer.name,
            editMode,
            savingId === customer.id
          )}
          draggable={editMode}
          eventHandlers={{
            click: () => handleMarkerClick(customer),
            ...(editMode ? { dragend: (e: L.LeafletEvent) => handleDragEnd(customer, e) } : {}),
          }}
        >
          {!editMode && (
            <Popup>
              <div style={{ minWidth: 160 }}>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>{customer.name}</p>
                {customer.address && (
                  <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{customer.address}</p>
                )}
                <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>{customer.lastWork}</p>
                <a
                  href={googleMapsUrl(customer)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '8px 12px',
                    background: '#06C755',
                    color: 'white',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Googleマップで開く
                </a>
              </div>
            </Popup>
          )}
        </Marker>
      ))}
    </MapContainer>
  );
}

function toMapCustomer(p: {
  id: string | number;
  customer_name: string;
  lat: number | null;
  lng: number | null;
  status: string;
  work_type: string[] | string | null;
  inquiry_date: string | null;
  address: string | null;
  assigned_to: string | number | null;
}): MapCustomer {
  return {
    id: String(p.id),
    name: p.customer_name,
    lat: Number(p.lat),
    lng: Number(p.lng),
    status: p.status,
    lastWork: `${String(p.inquiry_date ?? '').substring(0, 7)} ${
      Array.isArray(p.work_type) ? p.work_type.join(',') : (p.work_type ?? '')
    }`,
    address: p.address ?? undefined,
    assignedTo: p.assigned_to ? String(p.assigned_to) : undefined,
  };
}

export default MapContent;
