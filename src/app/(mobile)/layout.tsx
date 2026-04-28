'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import { AppHeader } from '@/components/layout/AppHeader';
import { BottomNav } from '@/components/layout/BottomNav';
import { Providers } from '@/components/ui/Providers';
import type { UserRole } from '@/types';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user: authUser } }) => {
      if (!authUser) {
        router.replace('/');
        return;
      }

      if (!user) {
        // m_users から詳細情報を取得
        const { data: userData } = await supabase
          .from('m_users')
          .select('id, name, role, email, phone, avatar_url, status, line_user_id, can_register_project')
          .eq('id', authUser.id)
          .single();

        if (userData) {
          setUser({
            id: userData.id,
            name: userData.name,
            role: userData.role as UserRole,
            email: userData.email ?? '',
            phone: userData.phone ?? undefined,
            avatar_url: userData.avatar_url ?? undefined,
            line_user_id: userData.line_user_id ?? undefined,
            status: userData.status as 'active' | 'retired',
            // DB の can_register_project を優先。列が未追加の場合は role=admin をフォールバックに使用
            can_register_project: userData.can_register_project ?? (userData.role === 'admin'),
          });
        } else {
          // m_users にいない場合は auth.user_metadata から補完
          const meta = authUser.user_metadata;
          if (meta?.name) {
            setUser({
              id: authUser.id,
              name: meta.name as string,
              role: (meta.role ?? 'sales') as UserRole,
              email: authUser.email ?? '',
              status: 'active',
              can_register_project: meta.role === 'admin',
            });
          } else {
            router.replace('/');
          }
        }
      }
    });

    // サインアウト検知
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        router.replace('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [user, setUser, router]);

  // セッション確認中はローディング
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-[#06C755] animate-spin" />
        <p className="text-gray-500 text-sm">認証確認中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-[500px] mx-auto px-3 pt-3 pb-[70px]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AuthGuard>{children}</AuthGuard>
    </Providers>
  );
}
