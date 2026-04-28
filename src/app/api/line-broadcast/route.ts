import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface BroadcastPayload {
  message: string;
}

async function fetchAllLineUserIds(): Promise<string[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return [];

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('m_users')
      .select('line_user_id')
      .eq('status', 'active')
      .not('line_user_id', 'is', null);

    if (error) {
      console.error('[line-broadcast] fetchUsers error:', error);
      return [];
    }
    return (data ?? [])
      .map((u: { line_user_id: string | null }) => u.line_user_id)
      .filter((id): id is string => !!id);
  } catch (e) {
    console.error('[line-broadcast] fetchUsers exception:', e);
    return [];
  }
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

    const { message }: BroadcastPayload = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ success: false, error: 'message は必須です' }, { status: 400 });
    }

    const lineUserIds = await fetchAllLineUserIds();
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
