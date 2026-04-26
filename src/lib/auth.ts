const LINE_CHANNEL_ID = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID ?? '';
const LINE_CALLBACK_URL = process.env.NEXT_PUBLIC_LINE_LOGIN_CALLBACK_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

/** LINE ログイン URL を生成 */
export function getLineLoginUrl(): string {
  const state = generateRandomState();
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('line_login_state', state);
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINE_CHANNEL_ID,
    redirect_uri: LINE_CALLBACK_URL,
    state,
    scope: 'profile openid',
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}

function generateRandomState(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/** LINE 認可コード → Supabase JWT 交換（auth-line Edge Function 経由） */
export async function exchangeLineCode(code: string): Promise<{
  access_token: string | null;
  refresh_token: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    line_user_id: string;
    avatar_url: string | null;
    status: string;
  } | null;
  error?: string;
}> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-line`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        code,
        redirect_uri: LINE_CALLBACK_URL,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        access_token: null,
        refresh_token: null,
        user: null,
        error: `Edge Function エラー (${res.status}): ${text}`,
      };
    }

    const data = await res.json();
    if (data.error) {
      return { access_token: null, refresh_token: null, user: null, error: data.message ?? data.error };
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
    };
  } catch (err) {
    return {
      access_token: null,
      refresh_token: null,
      user: null,
      error: `ネットワークエラー: ${String(err)}`,
    };
  }
}

export function clearLineState(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('line_login_state');
  }
}
