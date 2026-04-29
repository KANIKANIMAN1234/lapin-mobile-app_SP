/**
 * useVoiceInput
 *
 * Web Speech API が使える環境（Chrome等）ではリアルタイム音声認識、
 * 使えない環境（LIFFブラウザ・iOS等）では MediaRecorder + Whisper API にフォールバック。
 *
 * LIFF（LINE内ブラウザ）では webkitSpeechRecognition が存在するが
 * service-not-allowed / not-allowed エラーで即失敗するため、
 * ①LINEブラウザ検知、②onerror フォールバック の2段構えで対処。
 */
'use client';

import { useRef, useState, useCallback } from 'react';

interface UseVoiceInputOptions {
  currentText: string;
  onTextUpdate: (text: string) => void;
  onError?: (message: string) => void;
}

interface UseVoiceInputReturn {
  isRecording: boolean;
  voiceStatus: string;
  toggleVoice: () => void;
  /** Whisperモード（録音停止→送信中）のローディング状態 */
  transcribing: boolean;
}

/** LINEアプリ内ブラウザ（LIFF）かどうかを判定 */
function isLineInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  // LINE アプリの UserAgent には "Line/" が含まれる
  return ua.includes('Line/') || ua.includes(' LINE/');
}

function isSpeechRecognitionAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(( window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);
}

function isMediaRecorderAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

export function useVoiceInput({
  currentText,
  onTextUpdate,
  onError,
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [transcribing, setTranscribing] = useState(false);

  // Web Speech API 用
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // MediaRecorder (Whisper) 用
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // ────────────────────────────────────────────────
  // MediaRecorder + Whisper モード（LIFF対応の本命）
  // ────────────────────────────────────────────────
  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // サポートされている mimeType を選ぶ（Whisperはwebm/mp4/m4a/wav等対応）
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/aac')
        ? 'audio/aac'
        : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        setTranscribing(true);
        setVoiceStatus('文字起こし中...');

        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          const ext = recorder.mimeType?.includes('mp4') || recorder.mimeType?.includes('aac')
            ? 'audio.mp4'
            : 'audio.webm';
          const formData = new FormData();
          formData.append('audio', blob, ext);

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          });
          const json = await res.json();

          if (json.success && json.text) {
            onTextUpdate((currentText ? currentText + '\n' : '') + json.text);
            setVoiceStatus('文字起こし完了');
          } else {
            onError?.(json.error ?? '文字起こしに失敗しました');
            setVoiceStatus('');
          }
        } catch {
          onError?.('文字起こしに失敗しました');
          setVoiceStatus('');
        } finally {
          setTranscribing(false);
          setIsRecording(false);
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setVoiceStatus('録音中... 停止ボタンで文字起こし開始');
    } catch (err) {
      const msg = err instanceof Error && err.name === 'NotAllowedError'
        ? 'マイクへのアクセスが許可されていません。ブラウザのアドレスバーまたは設定からマイクを許可してください。'
        : 'マイクが利用できません。設定をご確認ください。';
      onError?.(msg);
      setIsRecording(false);
    }
  }, [currentText, onTextUpdate, onError]);

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
  }, []);

  // ────────────────────────────────────────────────
  // Web Speech API モード（Chrome等のみ）
  // onerror で service-not-allowed / not-allowed の場合は Whisper にフォールバック
  // ────────────────────────────────────────────────
  const startSpeechRecognition = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = currentText;
    let hasResult = false; // 一度でも認識結果が取れたか

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      hasResult = true;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim = t;
      }
      onTextUpdate(finalText + interim);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      recognitionRef.current = null;
      setIsRecording(false);
      setVoiceStatus('');

      const errorCode: string = e?.error ?? '';

      // LIFF等で使えない場合は Whisper にサイレントフォールバック
      if (errorCode === 'service-not-allowed' || errorCode === 'not-allowed') {
        if (isMediaRecorderAvailable()) {
          setVoiceStatus('録音モードに切り替えます...');
          startMediaRecorder();
        } else {
          onError?.('マイクへのアクセスが拒否されました。ブラウザの設定をご確認ください。');
        }
        return;
      }

      // no-speech は結果なしで終了したケース（エラートーストは不要）
      if (errorCode === 'no-speech') {
        if (!hasResult) setVoiceStatus('音声が検出されませんでした');
        return;
      }

      // その他のエラー
      onError?.(`音声認識エラー: ${errorCode || '不明なエラー'}`);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (recognitionRef.current) {
        setVoiceStatus('音声入力を終了しました');
        recognitionRef.current = null;
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setVoiceStatus('録音中... 停止ボタンで確定');
  }, [currentText, onTextUpdate, onError, startMediaRecorder]);

  const stopSpeechRecognition = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
    setVoiceStatus('');
  }, []);

  // ────────────────────────────────────────────────
  // 統合トグル
  // ────────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    if (isRecording) {
      if (recognitionRef.current) {
        stopSpeechRecognition();
      } else if (mediaRecorderRef.current) {
        stopMediaRecorder();
      }
      return;
    }

    // LINEアプリ内ブラウザ（LIFF）→ 最初から Whisper モード
    if (isLineInAppBrowser()) {
      if (isMediaRecorderAvailable()) {
        startMediaRecorder();
      } else {
        onError?.('お使いの環境は音声入力に対応していません');
      }
      return;
    }

    // 通常ブラウザ → Web Speech API を試みる（エラー時は onerror でフォールバック）
    if (isSpeechRecognitionAvailable()) {
      startSpeechRecognition();
    } else if (isMediaRecorderAvailable()) {
      startMediaRecorder();
    } else {
      onError?.('お使いの環境は音声入力に対応していません');
    }
  }, [
    isRecording,
    startSpeechRecognition,
    stopSpeechRecognition,
    startMediaRecorder,
    stopMediaRecorder,
    onError,
  ]);

  return { isRecording, voiceStatus, toggleVoice, transcribing };
}
