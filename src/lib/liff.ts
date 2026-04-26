'use client';

// LIFF SDK の型定義（CDN経由で読み込み）
declare global {
  interface Window {
    liff: {
      init: (config: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      logout: () => void;
      getProfile: () => Promise<{
        userId: string;
        displayName: string;
        pictureUrl?: string;
        statusMessage?: string;
      }>;
      getIDToken: () => string | null;
      isInClient: () => boolean;
      getOS: () => string;
    };
  }
}

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? '';

let liffInitialized = false;

export async function initLiff(): Promise<boolean> {
  if (liffInitialized) return true;

  // テスト環境またはLIFF IDが未設定の場合はデモモード
  if (!LIFF_ID || LIFF_ID === '') {
    console.warn('LIFF_ID not set. Running in demo mode.');
    return false;
  }

  try {
    if (typeof window === 'undefined' || !window.liff) {
      console.warn('LIFF SDK not loaded. Running in demo mode.');
      return false;
    }

    await window.liff.init({ liffId: LIFF_ID });
    liffInitialized = true;
    return true;
  } catch (error) {
    console.error('LIFF init failed:', error);
    return false;
  }
}

export function isLiffLoggedIn(): boolean {
  if (!liffInitialized || typeof window === 'undefined' || !window.liff) return false;
  return window.liff.isLoggedIn();
}

export function liffLogin(): void {
  if (typeof window !== 'undefined' && window.liff) {
    window.liff.login();
  }
}

export async function getLiffProfile() {
  if (!liffInitialized || typeof window === 'undefined' || !window.liff) return null;
  try {
    return await window.liff.getProfile();
  } catch {
    return null;
  }
}

export function getLiffIdToken(): string | null {
  if (!liffInitialized || typeof window === 'undefined' || !window.liff) return null;
  return window.liff.getIDToken();
}
