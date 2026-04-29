/**
 * 音声文字起こし API（OpenAI Whisper）
 * LIFF（LINE内ブラウザ）など Web Speech API が使えない環境向けフォールバック
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'OPENAI_API_KEY が設定されていません' }, { status: 500 });
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ success: false, error: '音声データがありません' }, { status: 400 });
    }

    // OpenAI Whisper API にそのまま転送
    const whisperForm = new FormData();
    whisperForm.append('file', audioFile, audioFile.name || 'audio.webm');
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('language', 'ja');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[transcribe] Whisper error:', err);
      return NextResponse.json({ success: false, error: '文字起こしに失敗しました' }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json({ success: true, text: data.text ?? '' });
  } catch (e) {
    console.error('[transcribe] error:', e);
    return NextResponse.json({ success: false, error: '文字起こし処理に失敗しました' }, { status: 500 });
  }
}
