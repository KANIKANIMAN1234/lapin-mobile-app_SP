import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPTS: Record<string, string> = {
  admin_project_desc:
    'あなたはリフォーム会社の事務アシスタントです。\n' +
    '音声入力で記録された案件の工事概要を、簡潔で正確な説明文に整形してください。\n' +
    '誤字脱字を修正し、ビジネス文書として適切な表現にしてください。\n' +
    'JSON形式のみで出力してください: {"formatted_text": "整形されたテキスト"}',
  project_work_desc:
    'あなたはリフォーム会社の事務アシスタントです。\n' +
    '音声入力で記録された工事概要を、簡潔で正確な説明文に整形してください。\n' +
    '誤字脱字を修正し、ビジネス文書として適切な表現にしてください。\n' +
    'JSON形式のみで出力してください: {"formatted_text": "整形されたテキスト"}',
  project_memo:
    'あなたはリフォーム会社の事務アシスタントです。\n' +
    '音声入力で記録されたメモを、読みやすい日本語に整形してください。\n' +
    '誤字脱字を修正してください。\n' +
    'JSON形式のみで出力してください: {"formatted_text": "整形されたテキスト"}',
  default:
    'あなたは日本語の文章校正アシスタントです。\n' +
    '入力テキストを丁寧なビジネス文書に整形してください。\n' +
    '誤字脱字を修正し、読みやすい文章にしてください。\n' +
    'JSON形式のみで出力してください: {"formatted_text": "整形されたテキスト"}',
};

export async function POST(req: NextRequest) {
  try {
    const { input_text, prompt_key } = await req.json();

    if (!input_text?.trim()) {
      return NextResponse.json({ success: false, error: '整形するテキストがありません' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'OPENAI_API_KEY が設定されていません' }, { status: 500 });
    }

    const systemPrompt = SYSTEM_PROMPTS[prompt_key] ?? SYSTEM_PROMPTS.default;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input_text },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[format-text] OpenAI error:', err);
      return NextResponse.json({ success: false, error: 'AI APIでエラーが発生しました' }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content);

    return NextResponse.json({ success: true, data: { formatted_text: parsed.formatted_text ?? '' } });
  } catch (e) {
    console.error('[format-text] error:', e);
    return NextResponse.json({ success: false, error: '整形処理に失敗しました' }, { status: 500 });
  }
}
