'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore, DEMO_USER } from '@/stores/authStore';
import {
  initLiff,
  isLiffLoggedIn,
  liffLogin,
  getLiffIdToken,
  IS_DEMO_MODE,
} from '@/lib/liff';
import { createClient } from '@/lib/supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ───────────────────────────────────────────────────────────
// auth-line Edge Function を呼び出し、Supabase セッションを確立する
// ───────────────────────────────────────────────────────────
async function authenticateWithLine(idToken: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-line`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ id_token: idToken }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `auth-line error: ${res.status}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      line_user_id: string;
      avatar_url: string | null;
      status: string;
    };
  }>;
}

// ───────────────────────────────────────────────────────────
// 認証初期化コンポーネント
// ───────────────────────────────────────────────────────────
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, setDemoMode } = useAuthStore();
  const [authState, setAuthState] = useState<'loading' | 'redirecting' | 'done'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);

      try {
        // ── デモモード（LIFF ID 未設定 = ローカル開発用） ──────
        if (IS_DEMO_MODE) {
          if (!cancelled) {
            setUser(DEMO_USER);
            setDemoMode(true);
            setAuthState('done');
          }
          return;
        }

        // ── LIFF SDK 初期化 ────────────────────────────────────
        const initResult = await initLiff();

        if (initResult !== 'ok') {
          console.warn('LIFF init result:', initResult, '→ demo mode');
          if (!cancelled) {
            setUser(DEMO_USER);
            setDemoMode(true);
            setAuthState('done');
          }
          return;
        }

        // ── 未ログイン → LINE 認証へリダイレクト ───────────────
        if (!isLiffLoggedIn()) {
          if (!cancelled) setAuthState('redirecting');
          liffLogin();
          return;
        }

        // ── LIFF ログイン済み → ID トークン取得 ────────────────
        const idToken = getLiffIdToken();
        if (!idToken) {
          throw new Error('LIFF ID token が取得できませんでした');
        }

        // ── auth-line Edge Function でセッション確立 ────────────
        const authData = await authenticateWithLine(idToken);

        // ── Supabase セッションをクライアントに設定 ──────────────
        const supabase = createClient();
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
        });

        if (sessionError) {
          console.error('setSession error:', sessionError);
          throw sessionError;
        }

        if (!cancelled) {
          setUser({
            id: authData.user.id,
            name: authData.user.name,
            role: authData.user.role as 'admin' | 'staff' | 'sales',
            email: authData.user.email,
            avatar_url: authData.user.avatar_url ?? undefined,
            line_user_id: authData.user.line_user_id,
            status: authData.user.status as 'active' | 'retired',
            can_register_project:
              authData.user.role === 'admin' || authData.user.role === 'staff',
          });
          setDemoMode(false);
          setAuthState('done');
        }
      } catch (err) {
        console.error('Auth init error:', err);
        if (!cancelled) {
          // エラー時はデモモードへフォールバック
          setUser(DEMO_USER);
          setDemoMode(true);
          setAuthState('done');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [setUser, setLoading, setDemoMode]);

  if (authState === 'redirecting') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-6">
        <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-[#06C755] animate-spin" />
        <p className="text-gray-500 text-sm font-medium">LINEログインへ移動中...</p>
      </div>
    );
  }

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-6">
        <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-[#06C755] animate-spin" />
        <p className="text-gray-500 text-sm font-medium">起動中...</p>
      </div>
    );
  }

  return <>{children}</>;
}

// ───────────────────────────────────────────────────────────
// Providers
// ───────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>{children}</AuthInitializer>
    </QueryClientProvider>
  );
}
