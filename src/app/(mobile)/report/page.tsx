'use client';

import { useState, useRef } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { useAuthStore } from '@/stores/authStore';
import { Toast } from '@/components/ui/Toast';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/hooks/useToast';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { createClient } from '@/lib/supabase';

const today = () => new Date().toISOString().split('T')[0];

/** 案件 Google Drive の「日報」フォルダへ保存し、表示用 URL 配列を返す */
async function uploadReportPhotosToDrive(
  accessToken: string,
  projectId: string,
  reportDate: string,
  dataUrls: string[],
): Promise<string[]> {
  if (dataUrls.length === 0) return [];
  const fd = new FormData();
  fd.append('projectId', projectId);
  fd.append('reportDate', reportDate);
  for (let i = 0; i < dataUrls.length; i++) {
    const res = await fetch(dataUrls[i]);
    const blob = await res.blob();
    const mime = blob.type || 'image/jpeg';
    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('heic') || mime.includes('heif')
          ? 'heic'
          : 'jpg';
    fd.append('file', blob, `photo_${i}.${ext}`);
  }
  const apiRes = await fetch('/api/report-photos-upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
  });
  const json = (await apiRes.json()) as { success?: boolean; urls?: string[]; error?: string };
  if (!apiRes.ok || !json.success || !Array.isArray(json.urls)) {
    throw new Error(json.error || '写真の Drive アップロードに失敗しました');
  }
  return json.urls;
}

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
  const [formatting, setFormatting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  const photoInputRef = useRef<HTMLInputElement>(null);

  const { isRecording, voiceStatus, toggleVoice, transcribing } = useVoiceInput({
    currentText: content,
    onTextUpdate: setContent,
    onError: (msg) => showToast(msg, 'error'),
  });

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
    if (!projectId) {
      showToast('関連案件を選択してください', 'error');
      return;
    }
    if (!user?.id) {
      showToast('ログイン情報が取得できません。再度ログインしてください。', 'error');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showToast('ログインセッションが無効です。再度ログインしてください。', 'error');
        return;
      }

      const titleFinal = title.trim() || `${date} 日報`;
      const uploadedUrls =
        photoUrls.length > 0
          ? await uploadReportPhotosToDrive(session.access_token, projectId, date, photoUrls)
          : null;

      const row = {
        user_id: user.id,
        project_id: projectId,
        report_date: date,
        title: titleFinal,
        content,
        photo_urls: uploadedUrls ?? [],
      };

      // 同一ユーザー×案件×日付は DB で 1 件のみ。再送信は更新扱いにする。
      const { data: existing, error: selErr } = await supabase
        .from('t_reports')
        .select('id')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .eq('report_date', date)
        .maybeSingle();
      if (selErr) throw selErr;

      if (existing?.id) {
        const patch: {
          title: string;
          content: string;
          photo_urls?: string[];
        } = { title: titleFinal, content };
        if (uploadedUrls !== null) patch.photo_urls = uploadedUrls;
        const { error } = await supabase.from('t_reports').update(patch).eq('id', existing.id);
        if (error) throw error;
        showToast('日報を更新しました', 'success');
      } else {
        const { error } = await supabase.from('t_reports').insert(row);
        if (error) throw error;
        showToast('日報を送信しました', 'success');
      }
      setProjectId('');
      setTitle('');
      setContent('');
      setDate(today());
      setPhotoUrls([]);
    } catch (err: unknown) {
      console.error('[ReportPage] submit', err);
      const msg = err instanceof Error ? err.message : '';
      const code =
        err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
      if (code === '23505') {
        showToast('この日付・案件の日報はすでに登録されています', 'error');
      } else if (msg) {
        showToast(msg, 'error');
      } else {
        showToast('日報の送信に失敗しました', 'error');
      }
    } finally {
      setLoading(false);
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
          <label>関連案件 *</label>
          <p className="text-xs text-gray-500 mb-1">
            PCの案件詳細「日報」タブに表示されます。添付写真は案件の Google Drive 内の「日報」フォルダに保存されます。同じ日・同じ案件で再送信すると本文は上書きされます（写真を付けたときのみ写真も更新）。
          </p>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">案件を選択してください</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_number} {p.customer_name}
              </option>
            ))}
          </select>
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
              disabled={transcribing}
            >
              {transcribing ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-icons text-white text-base">
                  {isRecording ? 'stop' : 'mic'}
                </span>
              )}
            </button>
          </div>
          {voiceStatus && (
            <p className={`text-xs mt-1 ${isRecording ? 'text-red-500 font-bold' : transcribing ? 'text-blue-500 font-bold' : 'text-gray-500'}`}>
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
