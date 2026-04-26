'use client';

declare global {
  interface Window {
    liff: {
      init: (config: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: (config?: { redirectUri?: string }) => void;
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

/** window.liff が定義されるまで最大 timeout ms 待機 */
async function waitForLiffSdk(timeout = 8000): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (window.liff) return true;

  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.liff) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

export async function initLiff(): Promise<'ok' | 'no_liff_id' | 'sdk_not_loaded' | 'init_failed'> {
  if (liffInitialized) return 'ok';

  if (!LIFF_ID || LIFF_ID === '') {
    return 'no_liff_id';
  }

  const sdkLoaded = await waitForLiffSdk();
  if (!sdkLoaded) {
    return 'sdk_not_loaded';
  }

  try {
    await window.liff.init({ liffId: LIFF_ID });
    liffInitialized = true;
    return 'ok';
  } catch (error) {
    console.error('LIFF init failed:', error);
    return 'init_failed';
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

export function liffLogout(): void {
  if (typeof window !== 'undefined' && window.liff) {
    window.liff.logout();
    liffInitialized = false;
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

export const IS_DEMO_MODE = !LIFF_ID;
