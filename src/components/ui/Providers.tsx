'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuthStore, DEMO_USER } from '@/stores/authStore';
import { initLiff, isLiffLoggedIn, getLiffProfile, getLiffIdToken } from '@/lib/liff';
import { createClient } from '@/lib/supabase';

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, setDemoMode } = useAuthStore();

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const liffReady = await initLiff();

        if (!liffReady) {
          // デモモード
          setUser(DEMO_USER);
          setDemoMode(true);
          setLoading(false);
          return;
        }

        if (!isLiffLoggedIn()) {
          // デモモードで動作
          setUser(DEMO_USER);
          setDemoMode(true);
          setLoading(false);
          return;
        }

        // LIFFプロフィール取得
        const profile = await getLiffProfile();
        const idToken = getLiffIdToken();

        if (!profile) {
          setUser(DEMO_USER);
          setDemoMode(true);
          setLoading(false);
          return;
        }

        // Supabase Edge Function で認証
        try {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const response = await fetch(`${supabaseUrl}/functions/v1/auth-line`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: idToken, line_user_id: profile.userId }),
          });

          if (response.ok) {
            const { user } = await response.json();
            if (user) {
              setUser(user);
              setDemoMode(false);
              setLoading(false);
              return;
            }
          }
        } catch {
          // Edge Function 未設定時はSupabaseから直接取得
        }

        // Supabase から直接ユーザー取得
        const supabase = createClient();
        const { data: dbUser } = await supabase
          .from('m_users')
          .select('*')
          .eq('line_user_id', profile.userId)
          .eq('status', 'active')
          .single();

        if (dbUser) {
          setUser(dbUser);
          setDemoMode(false);
        } else {
          // DBにユーザーが存在しない場合はLINEプロフィールでデモユーザー作成
          setUser({
            ...DEMO_USER,
            name: profile.displayName,
            avatar_url: profile.pictureUrl,
            line_user_id: profile.userId,
          });
          setDemoMode(true);
        }
      } catch {
        setUser(DEMO_USER);
        setDemoMode(true);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [setUser, setLoading, setDemoMode]);

  return <>{children}</>;
}

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>{children}</AuthInitializer>
    </QueryClientProvider>
  );
}
