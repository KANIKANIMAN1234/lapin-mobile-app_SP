import { createClient } from '@/lib/supabase';

export const DEFAULT_PHOTO_PHASE_OPTIONS = ['施工前', '現調', '下塗り', '完成'] as const;

export const LEGACY_PHOTO_PHASE_TO_JA: Record<string, string> = {
  before: '施工前',
  inspection: '現調',
  undercoat: '下塗り',
  completed: '完成',
};

export function canonicalPhotoPhase(stored: string): string {
  return LEGACY_PHOTO_PHASE_TO_JA[stored] ?? stored;
}

export async function fetchPhotoPhaseOptions(): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('m_settings')
    .select('value')
    .eq('key', 'photo_phase_options')
    .maybeSingle();
  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }
  return [...DEFAULT_PHOTO_PHASE_OPTIONS];
}
