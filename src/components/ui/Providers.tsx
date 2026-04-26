'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore, DEMO_USER } from '@/stores/authStore';
import {
  initLiff,
  isLiffLoggedIn,
  liffLogin,
  getLiffIdToken,
  isReturnFromLineAuth,
  IS_DEMO_MODE,
} from '@/lib/liff';
import { createClient } from '@/lib/supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── auth-line Edge Function を呼び出してセッションを確立 ──────
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

// ── LINEログインボタン画面 ─────────────────────────────────────
function LineLoginScreen({
  onLogin,
  errorMessage,
  isLoggingIn,
}: {
  onLogin: () => void;
  errorMessage?: string;
  isLoggingIn: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
      {/* ロゴ・タイトル */}
      <div className="flex flex-col items-center gap-3 mb-10">
        <div className="w-20 h-20 rounded-2xl bg-[#06C755] flex items-center justify-center shadow-lg">
          <span className="material-icons text-white text-4xl">business</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-800">ラパンリフォーム</h1>
        <p className="text-sm text-gray-500">業務管理システム</p>
      </div>

      {/* エラーメッセージ */}
      {errorMessage && (
        <div className="w-full max-w-sm mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
          {errorMessage}
        </div>
      )}

      {/* LINEログインボタン */}
      <button
        onClick={onLogin}
        disabled={isLoggingIn}
        className="w-full max-w-sm flex items-center justify-center gap-3 bg-[#06C755] hover:bg-[#05a548] disabled:bg-gray-300 text-white font-bold py-4 px-6 rounded-xl shadow-md transition-colors text-lg"
      >
        {isLoggingIn ? (
          <>
            <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            <span>ログイン中...</span>
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.035 2 11.05c0 4.495 3.455 8.255 8.13 9.022.315.065.745.2.855.46.097.237.063.608.031.85l-.138.798c-.042.244-.193.955.838.521 1.03-.434 5.56-3.275 7.59-5.607C20.803 15.16 22 13.198 22 11.05 22 6.034 17.52 2 12 2z"/>
            </svg>
            <span>LINEでログイン</span>
          </>
        )}
      </button>

      <p className="mt-6 text-xs text-gray-400 text-center">
        このアプリは社内業務専用です。<br />
        LINEアカウントでログインしてください。
      </p>
    </div>
  );
}

// ── 認証初期化コンポーネント ──────────────────────────────────
type AuthState = 'loading' | 'login' | 'login_error' | 'done';

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, setDemoMode } = useAuthStore();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [loginError, setLoginError] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        // ── デモモード（LIFF ID未設定 = ローカル開発用） ───────
        if (IS_DEMO_MODE) {
          if (!cancelled) {
            setUser(DEMO_USER);
            setDemoMode(true);
            setAuthState('done');
          }
          return;
        }

        // ── LIFF SDK 初期化 ─────────────────────────────────
        const initResult = await initLiff();

        if (initResult !== 'ok') {
          console.warn('LIFF init:', initResult, '→ demo mode');
          if (!cancelled) {
            setUser(DEMO_USER);
            setDemoMode(true);
            setAuthState('done');
          }
          return;
        }

        // ── ログイン状態チェック ─────────────────────────────
        if (!isLiffLoggedIn()) {
          if (!cancelled) {
            // LINEログイン後の戻りなのに未ログイン → エラー表示
            if (isReturnFromLineAuth()) {
              setLoginError('LINEログインに失敗しました。もう一度お試しください。');
              setAuthState('login_error');
            } else {
              setAuthState('login');
            }
          }
          return;
        }

        // ── LIFF ログイン済み → ID トークン取得 ────────────
        const idToken = getLiffIdToken();
        if (!idToken) {
          throw new Error('LIFF ID トークンが取得できませんでした');
        }

        // ── auth-line でセッション確立 ──────────────────────
        const authData = await authenticateWithLine(idToken);

        // ── Supabase セッション設定 ─────────────────────────
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
          setLoginError(
            err instanceof Error
              ? `認証エラー: ${err.message}`
              : '認証中にエラーが発生しました。'
          );
          setAuthState('login_error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [setUser, setLoading, setDemoMode]);

  // ハンドラ：ログインボタン押下
  const handleLogin = () => {
    setIsLoggingIn(true);
    liffLogin(); // LINE認証画面へリダイレクト（ここで処理が止まる）
  };

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-6">
        <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-[#06C755] animate-spin" />
        <p className="text-gray-500 text-sm font-medium">起動中...</p>
      </div>
    );
  }

  if (authState === 'login' || authState === 'login_error') {
    return (
      <LineLoginScreen
        onLogin={handleLogin}
        errorMessage={loginError || undefined}
        isLoggingIn={isLoggingIn}
      />
    );
  }

  return <>{children}</>;
}

// ── Providers ────────────────────────────────────────────────
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
