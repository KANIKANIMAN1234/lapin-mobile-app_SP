import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type NotifyTarget = 'all' | 'individual' | 'office' | 'sales';

interface BroadcastPayload {
  message: string;
  notifyTarget?: NotifyTarget;
  notifyUserId?: string | null;
}

function getServiceSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

async function collectLineUserIds(
  supabase: SupabaseClient,
  target: NotifyTarget,
  notifyUserId?: string | null,
): Promise<string[]> {
  if (target === 'individual') {
    if (!notifyUserId?.trim()) return [];
    const { data, error } = await supabase
      .from('m_users')
      .select('line_user_id')
      .eq('id', notifyUserId.trim())
      .eq('status', 'active')
      .maybeSingle();
    if (error) {
      console.error('[line-broadcast] individual fetch error:', error);
      return [];
    }
    const id = data?.line_user_id;
    return id ? [id] : [];
  }

  if (target === 'office') {
    const { data, error } = await supabase
      .from('m_users')
      .select('line_user_id')
      .eq('status', 'active')
      .in('role', ['admin', 'staff'])
      .not('line_user_id', 'is', null);
    if (error) {
      console.error('[line-broadcast] office fetch error:', error);
      return [];
    }
    return (data ?? [])
      .map((u: { line_user_id: string | null }) => u.line_user_id)
      .filter((id): id is string => !!id);
  }

  if (target === 'sales') {
    const { data, error } = await supabase
      .from('m_users')
      .select('line_user_id')
      .eq('status', 'active')
      .eq('role', 'sales')
      .not('line_user_id', 'is', null);
    if (error) {
      console.error('[line-broadcast] sales fetch error:', error);
      return [];
    }
    return (data ?? [])
      .map((u: { line_user_id: string | null }) => u.line_user_id)
      .filter((id): id is string => !!id);
  }

  const { data, error } = await supabase
    .from('m_users')
    .select('line_user_id')
    .eq('status', 'active')
    .not('line_user_id', 'is', null);

  if (error) {
    console.error('[line-broadcast] all fetch error:', error);
    return [];
  }
  return (data ?? [])
    .map((u: { line_user_id: string | null }) => u.line_user_id)
    .filter((id): id is string => !!id);
}

async function sendPush(lineUserId: string, message: string, accessToken: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text: message }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[line-broadcast] push error (${lineUserId}): ${err.slice(0, 200)}`);
  }
  return res.ok;
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'LINE_CHANNEL_ACCESS_TOKEN が設定されていません' },
        { status: 500 },
      );
    }

    let body: BroadcastPayload;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const { message, notifyTarget = 'all', notifyUserId } = body;
    if (!message?.trim()) {
      return NextResponse.json({ success: false, error: 'message は必須です' }, { status: 400 });
    }

    if (notifyTarget === 'individual' && !notifyUserId?.trim()) {
      return NextResponse.json(
        { success: false, error: '個別通知には notifyUserId が必要です' },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Supabase 環境変数が設定されていません' },
        { status: 500 },
      );
    }

    const lineUserIds = await collectLineUserIds(supabase, notifyTarget, notifyUserId);
    if (lineUserIds.length === 0) {
      return NextResponse.json({ success: true, message: '送信対象ユーザーがいません', sent: 0 });
    }

    let sent = 0;
    for (const lineUserId of lineUserIds) {
      const ok = await sendPush(lineUserId, message, accessToken);
      if (ok) sent++;
    }

    return NextResponse.json({
      success: true,
      message: `LINE通知を送信しました（${sent}/${lineUserIds.length}件）`,
      sent,
    });
  } catch (e) {
    console.error('[line-broadcast] error:', e);
    return NextResponse.json({ success: false, error: 'LINE一斉通知に失敗しました' }, { status: 500 });
  }
}
