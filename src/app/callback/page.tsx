'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { exchangeLineCode, clearLineState } from '@/lib/auth';
import { createClient } from '@/lib/supabase';
import type { UserRole } from '@/types';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuthStore();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(
        'LINE認証がキャンセルされました: ' +
          (searchParams.get('error_description') ?? errorParam)
      );
      return;
    }

    if (!code) {
      setError('認証コードが取得できませんでした');
      return;
    }

    // state 検証
    const savedState = sessionStorage.getItem('line_login_state');
    if (savedState && state !== savedState) {
      setError('認証状態が一致しません。再度ログインしてください。');
      return;
    }

    (async () => {
      try {
        // LINE code → Supabase JWT（auth-line Edge Function 経由）
        const result = await exchangeLineCode(code);

        if (!result.access_token || !result.refresh_token || !result.user) {
          setError('認証に失敗しました: ' + (result.error ?? '不明なエラー'));
          return;
        }

        // Supabase クライアントにセッションをセット
        const supabase = createClient();
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });

        if (sessionError) {
          setError('セッション設定に失敗しました: ' + sessionError.message);
          return;
        }

        // Zustand にユーザー情報をセット
        setUser({
          id: result.user.id,
          name: result.user.name,
          role: result.user.role as UserRole,
          email: result.user.email,
          avatar_url: result.user.avatar_url ?? undefined,
          line_user_id: result.user.line_user_id,
          status: result.user.status as 'active' | 'retired',
          can_register_project:
            result.user.role === 'admin' || result.user.role === 'staff',
        });

        clearLineState();
        router.replace('/expense');
      } catch (err) {
        setError('ログイン処理中にエラーが発生しました: ' + String(err));
      }
    })();
  }, [searchParams, setUser, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="bg-white rounded-2xl p-8 shadow-lg w-full max-w-sm text-center">
          <span className="material-icons text-5xl text-red-400 mb-4 block">error_outline</span>
          <h2 className="text-lg font-bold mb-2 text-gray-800">ログインエラー</h2>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-[#06C755] hover:bg-[#05a548] text-white font-bold py-3 px-6 rounded-xl transition-colors"
          >
            ログイン画面に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-[#06C755] animate-spin" />
      <p className="text-gray-600 text-sm font-medium">LINE認証処理中...</p>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-[#06C755] animate-spin" />
          <p className="text-gray-600 text-sm">読み込み中...</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
