/**
 * useVoiceInput
 *
 * Web Speech API が使える環境（Chrome等）ではリアルタイム音声認識、
 * 使えない環境（LIFFブラウザ・iOS等）では MediaRecorder + Whisper API にフォールバック。
 *
 * 使い方:
 *   const { isRecording, voiceStatus, toggleVoice } = useVoiceInput({
 *     currentText: someState,
 *     onTextUpdate: (text) => setSomeState(text),
 *     onError: (msg) => showToast(msg, 'error'),
 *   });
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
  // Web Speech API モード
  // ────────────────────────────────────────────────
  const startSpeechRecognition = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = currentText;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim = t;
      }
      onTextUpdate(finalText + interim);
    };
    recognition.onerror = () => {
      setIsRecording(false);
      setVoiceStatus('');
      recognitionRef.current = null;
      onError?.('音声認識エラーが発生しました');
    };
    recognition.onend = () => {
      setIsRecording(false);
      setVoiceStatus('音声入力を終了しました');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setVoiceStatus('録音中... 停止ボタンで確定');
  }, [currentText, onTextUpdate, onError]);

  const stopSpeechRecognition = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
    setVoiceStatus('');
  }, []);

  // ────────────────────────────────────────────────
  // MediaRecorder + Whisper モード
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
        : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // ストリームを停止
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        setTranscribing(true);
        setVoiceStatus('文字起こし中...');

        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          const ext = recorder.mimeType?.includes('mp4') ? 'audio.mp4' : 'audio.webm';
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

      recorder.start(1000); // 1秒ごとにデータを収集
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setVoiceStatus('録音中... 停止ボタンで文字起こし開始');
    } catch {
      onError?.('マイクへのアクセスが許可されていません。ブラウザの設定をご確認ください。');
      setIsRecording(false);
    }
  }, [currentText, onTextUpdate, onError]);

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setVoiceStatus('文字起こし中...');
  }, []);

  // ────────────────────────────────────────────────
  // 統合トグル
  // ────────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    if (isRecording) {
      // 停止
      if (recognitionRef.current) {
        stopSpeechRecognition();
      } else if (mediaRecorderRef.current) {
        stopMediaRecorder();
      }
      return;
    }

    if (isSpeechRecognitionAvailable()) {
      // Web Speech API が使える場合（Chrome等）
      startSpeechRecognition();
    } else if (isMediaRecorderAvailable()) {
      // フォールバック：MediaRecorder + Whisper（LIFFブラウザ等）
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
