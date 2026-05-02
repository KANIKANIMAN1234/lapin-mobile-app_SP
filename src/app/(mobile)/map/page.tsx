'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import type { MapCustomer } from '@/components/features/map/MapContent';
import { useAuthStore } from '@/stores/authStore';

const MapContent = dynamic(() => import('@/components/features/map/MapContent'), { ssr: false });

const MAP_FILTER_KEY = (userId: string) => `map_filter_my_mobile_${userId}`;

function parsePinParams(
  pinLatParam: string | null,
  pinLngParam: string | null
): [number, number] | undefined {
  if (!pinLatParam || !pinLngParam) return undefined;
  const lat = Number(pinLatParam);
  const lng = Number(pinLngParam);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return [lat, lng];
}

function MapPageInner() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const focusProjectId = searchParams.get('focus') ?? '';

  const pinLatParam = searchParams.get('pin_lat');
  const pinLngParam = searchParams.get('pin_lng');
  const pinLabelParam = searchParams.get('pin_label') ?? '位置情報';
  const locationPin = parsePinParams(pinLatParam, pinLngParam);

  const [selectedCustomer, setSelectedCustomer] = useState<MapCustomer | null>(null);
  const [focusCenter, setFocusCenter] = useState<[number, number] | null>(null);
  const [focusZoom, setFocusZoom] = useState<number | undefined>(undefined);
  const [geocodingRemaining, setGeocodingRemaining] = useState(0);
  const [filterMyOnly, setFilterMyOnly] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const v = localStorage.getItem(MAP_FILTER_KEY(user.id));
      if (v === 'true') setFilterMyOnly(true);
    } catch {
      /* 無視 */
    }
  }, [user?.id]);

  useEffect(() => {
    const pin = parsePinParams(pinLatParam, pinLngParam);
    if (!pin) return;
    setFocusCenter(pin);
    setFocusZoom(16);
  }, [pinLatParam, pinLngParam]);

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const toggleFilter = () => {
    const next = !filterMyOnly;
    setFilterMyOnly(next);
    if (user?.id) {
      try {
        localStorage.setItem(MAP_FILTER_KEY(user.id), String(next));
      } catch {
        /* 無視 */
      }
    }
  };

  return (
    <div className="flex flex-col gap-2 -mx-3 -mt-3" style={{ height: 'calc(100dvh - 7.5rem)' }}>
      <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterMyOnly}
            onChange={toggleFilter}
            className="rounded border-gray-300 text-line-green focus:ring-line-green"
          />
          <span>自分の案件のみ</span>
        </label>
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          className={`px-2 py-1 rounded-md font-medium border ${
            editMode
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300'
          }`}
        >
          {editMode ? '閲覧モード' : '位置調整'}
        </button>
        {geocodingRemaining > 0 && (
          <span className="text-gray-500">住所から座標取得中… 残り {geocodingRemaining}</span>
        )}
      </div>

      <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm relative">
        <MapContent
          selectedCustomer={selectedCustomer}
          onSelectCustomer={setSelectedCustomer}
          center={focusCenter ?? undefined}
          centerZoom={focusZoom}
          filterMyOnly={filterMyOnly}
          currentUserId={user?.id}
          focusProjectId={focusProjectId || undefined}
          onFocusResolved={(_, coords) => {
            setFocusCenter(coords);
            setFocusZoom(15);
          }}
          onGeocodingProgress={setGeocodingRemaining}
          editMode={editMode}
          onPositionSaved={(name) => showToast(`${name} の位置を保存しました`, true)}
          onPositionError={(name) => showToast(`${name} の保存に失敗しました`, false)}
          locationPin={locationPin}
          locationPinLabel={pinLabelParam}
        />
      </div>

      {selectedCustomer && !editMode && (
        <div className="px-1 text-xs text-gray-600 border-t border-gray-100 pt-2">
          <span className="font-semibold text-gray-800">{selectedCustomer.name}</span>
          {selectedCustomer.address && (
            <span className="block mt-0.5 truncate">{selectedCustomer.address}</span>
          )}
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[110] px-4 py-2 rounded-lg text-sm text-white shadow-lg max-w-[90vw] ${
            toast.ok ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center py-16 text-gray-500 text-sm">地図を読み込み中…</div>
      }
    >
      <MapPageInner />
    </Suspense>
  );
}
