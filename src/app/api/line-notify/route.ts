import { NextRequest, NextResponse } from 'next/server';

// ── 型定義 ────────────────────────────────────────────────────
export interface LineNotifyPayload {
  projectNumber?: string;
  customerName: string;
  address: string;
  workDescription?: string;
  workType: string[];
  estimatedAmount: number;
  acquisitionRoute: string;
  inquiryDate: string;
  assignedUserName?: string;
  assignedLineUserId?: string;
  adminLineUserIds: string[];
}

// ── LINE Messaging API 送信ヘルパー ───────────────────────────
async function sendPush(lineUserId: string, messages: object[], accessToken: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to: lineUserId, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[line-notify] push error (${lineUserId}): ${err.slice(0, 200)}`);
  }
  return res.ok;
}

// ── Flex Message（担当者向け・了解ボタン付き）────────────────
function buildProjectFlex(data: LineNotifyPayload): object {
  const amount =
    data.estimatedAmount >= 10000
      ? `${Math.floor(data.estimatedAmount / 10000)}万円`
      : `${data.estimatedAmount.toLocaleString()}円`;

  const infoRow = (label: string, value: string) => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    margin: 'sm',
    contents: [
      { type: 'text', text: label, size: 'xs', color: '#aaaaaa', flex: 0, wrap: false },
      { type: 'text', text: value || '-', size: 'xs', color: '#333333', flex: 1, wrap: true, align: 'end' },
    ],
  });

  const projectNumber = data.projectNumber ?? '';

  return {
    type: 'bubble',
    size: 'giga',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      backgroundColor: '#1DB446',
      contents: [
        { type: 'text', text: '📋 新規案件割り当て', weight: 'bold', size: 'lg', color: '#ffffff' },
        ...(projectNumber
          ? [{ type: 'text', text: projectNumber, size: 'sm', color: '#ffffffcc', margin: 'xs' }]
          : []),
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: data.customerName, weight: 'bold', size: 'xl', color: '#333333' },
        { type: 'separator', margin: 'md' },
        infoRow('住所', data.address),
        ...(data.workDescription ? [infoRow('案件概要', data.workDescription)] : []),
        infoRow('工事種別', data.workType.join('・')),
        infoRow('見込み金額', amount),
        infoRow('取得経路', data.acquisitionRoute),
        infoRow('問合せ日', data.inquiryDate),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '✅ 了解しました',
            data: `action=ack_project&project_number=${encodeURIComponent(projectNumber)}&customer_name=${encodeURIComponent(data.customerName)}`,
            displayText: `案件「${projectNumber} ${data.customerName}」了解しました`,
          },
          style: 'primary',
          color: '#1DB446',
          height: 'md',
        },
      ],
    },
  };
}

// ── テキストメッセージ（管理者向け）──────────────────────────
function buildTextMessage(data: LineNotifyPayload): string {
  const amount =
    data.estimatedAmount >= 10000
      ? `${Math.floor(data.estimatedAmount / 10000)}万円`
      : `${data.estimatedAmount.toLocaleString()}円`;

  return (
    `📋【新規案件登録】\n━━━━━━━━━━━━━━\n` +
    (data.projectNumber ? `管理番号: ${data.projectNumber}\n` : '') +
    `顧客名: ${data.customerName}\n` +
    `住所: ${data.address}\n` +
    (data.workDescription ? `案件概要: ${data.workDescription}\n` : '') +
    `工事種別: ${data.workType.join('・')}\n` +
    `見込み金額: ${amount}\n` +
    `取得経路: ${data.acquisitionRoute}\n` +
    `問合せ日: ${data.inquiryDate}\n` +
    `━━━━━━━━━━━━━━\n` +
    (data.assignedUserName
      ? `担当者にアサインされました。\n担当: ${data.assignedUserName}`
      : '担当者未割り当て')
  );
}

// ── POST ハンドラ ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      console.error('[line-notify] LINE_CHANNEL_ACCESS_TOKEN が未設定');
      return NextResponse.json(
        { success: false, error: 'LINE_CHANNEL_ACCESS_TOKEN が設定されていません' },
        { status: 500 },
      );
    }

    const data: LineNotifyPayload = await req.json();

    if (!data.customerName) {
      return NextResponse.json({ success: false, error: 'customerName は必須です' }, { status: 400 });
    }

    const sentLineIds = new Set<string>();

    // ① 担当者に Flex Message（了解ボタン付き）
    if (data.assignedLineUserId) {
      const flex = buildProjectFlex(data);
      await sendPush(
        data.assignedLineUserId,
        [{ type: 'flex', altText: `📋 新規案件「${data.customerName}」が割り当てられました`, contents: flex }],
        accessToken,
      );
      sentLineIds.add(data.assignedLineUserId);
    }

    // ② 管理者全員にテキストメッセージ（重複除外）
    const textBody = buildTextMessage(data);
    for (const lineUserId of data.adminLineUserIds) {
      if (sentLineIds.has(lineUserId)) continue;
      await sendPush(lineUserId, [{ type: 'text', text: textBody }], accessToken);
      sentLineIds.add(lineUserId);
    }

    return NextResponse.json({
      success: true,
      message: `LINE通知を送信しました（計${sentLineIds.size}件）`,
    });
  } catch (e) {
    console.error('[line-notify] error:', e);
    return NextResponse.json({ success: false, error: 'LINE通知に失敗しました' }, { status: 500 });
  }
}
