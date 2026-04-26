'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore, DEMO_USER } from '@/stores/authStore';
import {
  initLiff,
  isLiffLoggedIn,
  liffLogin,
  getLiffProfile,
  IS_DEMO_MODE,
} from '@/lib/liff';
import { createClient } from '@/lib/supabase';

// ───────────────────────────────────────────
// 認証初期化コンポーネント
// ───────────────────────────────────────────
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, setDemoMode } = useAuthStore();
  const [authState, setAuthState] = useState<'loading' | 'login' | 'done'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);

      try {
        // ── デモモード（LIFF ID未設定）──────────────────
        if (IS_DEMO_MODE) {
          if (!cancelled) {
            setUser(DEMO_USER);
            setDemoMode(true);
            setAuthState('done');
          }
          return;
        }

        // ── LIFF SDK 初期化 ──────────────────────────
        const initResult = await initLiff();

        if (initResult !== 'ok') {
          // SDK未ロード or 初期化失敗 → デモモード
          console.warn('LIFF init result:', initResult, '→ demo mode');
          if (!cancelled) {
            setUser(DEMO_USER);
            setDemoMode(true);
            setAuthState('done');
          }
          return;
        }

        // ── 未ログイン → LINEログインへリダイレクト ────
        if (!isLiffLoggedIn()) {
          if (!cancelled) {
            setAuthState('login');
          }
          liffLogin();
          return;
        }

        // ── LIFFログイン済み → プロフィール取得 ─────────
        const profile = await getLiffProfile();

        if (!profile) {
          if (!cancelled) {
            setUser(DEMO_USER);
            setDemoMode(true);
            setAuthState('done');
          }
          return;
        }

        // ── Supabase からユーザー情報取得 ────────────────
        const supabase = createClient();
        const { data: dbUser, error } = await supabase
          .from('m_users')
          .select('id, name, role, email, phone, avatar_url, line_user_id, status')
          .eq('line_user_id', profile.userId)
          .eq('status', 'active')
          .maybeSingle();

        if (!cancelled) {
          if (dbUser) {
            setUser({
              id: dbUser.id,
              name: dbUser.name,
              role: dbUser.role,
              email: dbUser.email ?? '',
              phone: dbUser.phone ?? undefined,
              avatar_url: dbUser.avatar_url ?? profile.pictureUrl,
              line_user_id: dbUser.line_user_id ?? undefined,
              status: dbUser.status,
              can_register_project: dbUser.role === 'admin' || dbUser.role === 'staff',
            });
            setDemoMode(false);
          } else {
            // DBにユーザーが存在しない（未登録 or 退職）→ LINEプロフィールで仮ログイン
            console.warn('User not found in DB (line_user_id:', profile.userId, '):', error?.message);
            setUser({
              ...DEMO_USER,
              name: profile.displayName,
              avatar_url: profile.pictureUrl,
              line_user_id: profile.userId,
            });
            setDemoMode(true);
          }
          setAuthState('done');
        }
      } catch (err) {
        console.error('Auth init error:', err);
        if (!cancelled) {
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

  // LINEログインへリダイレクト中
  if (authState === 'login') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-line-green animate-spin" />
        <p className="text-gray-500 text-sm">LINEログインへ移動中...</p>
      </div>
    );
  }

  // 初期ローディング
  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-line-green animate-spin" />
        <p className="text-gray-500 text-sm">起動中...</p>
      </div>
    );
  }

  return <>{children}</>;
}

// ───────────────────────────────────────────
// Providers
// ───────────────────────────────────────────
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
