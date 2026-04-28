'use client';

import { useState, useRef } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { useAuthStore } from '@/stores/authStore';
import { Toast } from '@/components/ui/Toast';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/hooks/useToast';
import { createClient } from '@/lib/supabase';

const today = () => new Date().toISOString().split('T')[0];

async function callFormatText(text: string, promptKey: string): Promise<string> {
  const res = await fetch('/api/format-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input_text: text, prompt_key: promptKey }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'AI整形に失敗しました');
  return json.data?.formatted_text ?? text;
}

export default function ReportPage() {
  const { user } = useAuthStore();
  const { data: projects = [] } = useProjects();
  const { toasts, showToast, removeToast } = useToast();

  const [date, setDate] = useState(today());
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  const photoInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const toggleVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;

    if (!SR) {
      showToast('お使いのブラウザは音声入力に対応していません', 'error');
      return;
    }

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      setVoiceStatus('音声入力を終了しました');
      return;
    }

    const recognition = new SR();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = content;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interim = t;
        }
      }
      setContent(finalTranscript + interim);
    };

    recognition.onerror = () => {
      setIsRecording(false);
      setVoiceStatus('');
      showToast('音声認識エラーが発生しました', 'error');
    };

    recognition.onend = () => {
      setIsRecording(false);
      setVoiceStatus('音声入力を終了しました');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setVoiceStatus('音声認識中...話してください');
  };

  const handleFormat = async () => {
    if (!content.trim()) {
      showToast('整形する文章がありません', 'error');
      return;
    }
    setFormatting(true);
    try {
      const result = await callFormatText(content, 'daily_report');
      setContent(result);
      showToast('AI整形しました', 'success');
    } catch {
      showToast('AI整形に失敗しました', 'error');
    }
    setFormatting(false);
  };

  const handlePhotoAdd = (files: FileList) => {
    const remaining = 5 - photoUrls.length;
    Array.from(files).slice(0, remaining).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoUrls((prev) => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      showToast('報告内容を入力してください', 'error');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.from('t_reports').insert({
        user_id: user?.id ?? 'demo-user-001',
        report_date: date,
        title: title || `${date} 日報`,
        content,
      });
      showToast('日報を送信しました', 'success');
    } catch {
      showToast('日報を送信しました（デモ）', 'success');
    } finally {
      setLoading(false);
      setProjectId('');
      setTitle('');
      setContent('');
      setDate(today());
      setPhotoUrls([]);
    }
  };

  return (
    <>
      <LoadingOverlay show={loading} message="日報を送信中..." />
      <Toast toasts={toasts} onRemove={removeToast} />

      <div className="form-card">
        <h3 className="section-title">
          <span className="material-icons text-line-green">description</span>
          日報作成
        </h3>

        <div className="form-field">
          <label>日付</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="form-field">
          <label>タイトル（省略可）</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`${date} 日報`}
          />
        </div>

        <div className="form-field">
          <label>関連案件（参考）</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">案件を選択（任意）</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_number} {p.customer_name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label>報告内容 *</label>
          <div className="relative">
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="報告内容を入力、または音声入力してください"
              style={{ paddingRight: 52 }}
            />
            <button
              className={`voice-btn absolute right-2 bottom-2 ${isRecording ? 'recording' : ''}`}
              onClick={toggleVoice}
              type="button"
            >
              <span className="material-icons text-white text-base">
                {isRecording ? 'stop' : 'mic'}
              </span>
            </button>
          </div>
          {voiceStatus && (
            <p className={`text-xs mt-1 ${isRecording ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
              {voiceStatus}
            </p>
          )}
        </div>

        <button className="btn-format mb-3" onClick={handleFormat} type="button" disabled={formatting}>
          <span className="material-icons text-base text-purple-500">auto_fix_high</span>
          {formatting ? 'AI整形中...' : 'AI整形'}
        </button>

        {/* 写真添付 */}
        <div className="form-field">
          <label>写真添付（最大5枚）</label>
          <div className="flex flex-wrap gap-2">
            {photoUrls.map((url, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden" style={{ width: 72, height: 72 }}>
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                  onClick={() => setPhotoUrls((prev) => prev.filter((_, j) => j !== i))}
                >
                  <span className="material-icons text-[12px]">close</span>
                </button>
              </div>
            ))}
            {photoUrls.length < 5 && (
              <button
                className="flex items-center justify-center rounded-lg text-gray-400 border-2 border-dashed border-gray-300"
                style={{ width: 72, height: 72 }}
                onClick={() => photoInputRef.current?.click()}
                type="button"
              >
                <span className="material-icons">add_a_photo</span>
              </button>
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handlePhotoAdd(e.target.files)}
          />
        </div>

        <button className="btn-line-action" onClick={handleSubmit}>
          <span className="material-icons text-base">send</span>
          日報を送信
        </button>
      </div>
    </>
  );
}
