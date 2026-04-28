import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ── LINE 署名検証 ──────────────────────────────────────────────
function verifySignature(rawBody: string, signature: string, channelSecret: string): boolean {
  const hash = crypto.createHmac('SHA256', channelSecret).update(rawBody).digest('base64');
  return hash === signature;
}

// ── LINE メッセージ送信ヘルパー ───────────────────────────────
async function sendLineText(lineUserId: string, text: string, accessToken: string) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
}

// ── POST ハンドラ（LINE Webhook エンドポイント）───────────────
export async function POST(req: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelSecret || !accessToken) {
    console.error('[line-webhook] LINE設定が未完了');
    return new NextResponse('OK'); // LINEには常に200を返す
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-line-signature') ?? '';

  if (!verifySignature(rawBody, signature, channelSecret)) {
    console.error('[line-webhook] 署名検証失敗');
    return new NextResponse('OK'); // 不正アクセスでも200を返してLINEにリトライさせない
  }

  let body: { events?: Record<string, unknown>[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse('OK');
  }

  const events = body.events ?? [];

  for (const event of events) {
    try {
      if (event.type !== 'postback') continue;

      const postback = event.postback as { data?: string };
      const source = event.source as { userId?: string };
      const postbackData = Object.fromEntries(
        (postback.data ?? '').split('&').map((pair) => {
          const idx = pair.indexOf('=');
          return idx > 0
            ? [pair.slice(0, idx), decodeURIComponent(pair.slice(idx + 1))]
            : [pair, ''];
        }),
      );

      if (postbackData.action === 'ack_project') {
        await handleAckProject(
          source.userId ?? '',
          postbackData.project_number ?? '',
          postbackData.customer_name ?? '',
          accessToken,
        );
      }
    } catch (e) {
      console.error('[line-webhook] event処理エラー:', e);
    }
  }

  return new NextResponse('OK');
}

// ── 了解ボタン処理 ────────────────────────────────────────────
async function handleAckProject(
  lineUserId: string,
  projectNumber: string,
  customerName: string,
  accessToken: string,
) {
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  // 担当者本人に確認メッセージ
  if (lineUserId) {
    await sendLineText(
      lineUserId,
      `✅ 案件「${projectNumber} ${customerName}」の了解を送信しました。`,
      accessToken,
    );
  }

  // 管理者全員に了解通知
  const admins = await fetchAdmins();
  if (!admins.length) return;

  // 担当者の名前を line_user_id から逆引き
  const ackUser = admins.find((u) => u.line_user_id === lineUserId);
  const ackUserName = ackUser?.name ?? '担当者';

  const msg =
    `✅【案件了解通知】\n━━━━━━━━━━━━━━\n` +
    `🙋 ${ackUserName}さんが了解しました\n` +
    `━━━━━━━━━━━━━━\n` +
    (projectNumber ? `案件: ${projectNumber}\n` : '') +
    `顧客名: ${customerName}\n` +
    `応答日時: ${now}`;

  for (const admin of admins) {
    if (!admin.line_user_id) continue;
    await sendLineText(admin.line_user_id, msg, accessToken);
  }
}

// ── Supabase から管理者一覧を取得 ─────────────────────────────
async function fetchAdmins(): Promise<{ name: string; line_user_id: string | null }[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return [];

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('m_users')
      .select('name, line_user_id')
      .eq('role', 'admin')
      .eq('status', 'active');

    if (error) {
      console.error('[line-webhook] fetchAdmins error:', error);
      return [];
    }
    return data ?? [];
  } catch (e) {
    console.error('[line-webhook] fetchAdmins exception:', e);
    return [];
  }
}
