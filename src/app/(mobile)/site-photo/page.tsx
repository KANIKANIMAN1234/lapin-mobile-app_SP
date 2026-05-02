'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import { fetchPhotoPhaseOptions } from '@/lib/photoPhaseOptions';
import { Toast } from '@/components/ui/Toast';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/hooks/useToast';
import { useVoiceInput } from '@/hooks/useVoiceInput';

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

export default function SitePhotoPage() {
  const { user } = useAuthStore();
  const { data: projects = [] } = useProjects();
  const { toasts, showToast, removeToast } = useToast();

  const [phaseOptions, setPhaseOptions] = useState<string[]>([]);
  const [projectId, setProjectId] = useState('');
  const [photoDate, setPhotoDate] = useState(today());
  const [photoPhase, setPhotoPhase] = useState('');
  const [memo, setMemo] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [formatting, setFormatting] = useState(false);
  const [loading, setLoading] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPhotoPhaseOptions().then((opts) => {
      if (cancelled) return;
      setPhaseOptions(opts);
      setPhotoPhase((prev) => (prev && opts.includes(prev) ? prev : opts[0] ?? ''));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  );

  /** 案件マスタの work_type をそのまま表示・ファイル名メタに利用 */
  const workTypeLabel = useMemo(() => {
    const w = selectedProject?.work_type;
    if (!w?.length) return '';
    return w.filter((s) => typeof s === 'string' && s.trim()).join('、');
  }, [selectedProject]);

  const { isRecording, voiceStatus, toggleVoice, transcribing } = useVoiceInput({
    currentText: memo,
    onTextUpdate: setMemo,
    onError: (msg) => showToast(msg, 'error'),
  });

  const handleProjectChange = (id: string) => {
    setProjectId(id);
  };

  const handlePhotoSelect = (files: FileList) => {
    const remaining = 10 - photos.length;
    Array.from(files).slice(0, remaining).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotos((prev) => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleUpload = async () => {
    if (!projectId) {
      showToast('案件を選択してください', 'error');
      return;
    }
    if (!user?.id) {
      showToast('ログインが必要です', 'error');
      return;
    }
    if (!photoPhase) {
      showToast('撮影フェーズを選択してください', 'error');
      return;
    }
    if (photos.length === 0) {
      showToast('写真を選択してください', 'error');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    try {
      for (let i = 0; i < photos.length; i++) {
        const dataUrl = photos[i];
        const fakeFileId = `mobile_${Date.now()}_${i}`;
        const meta = [photoDate, photoPhase, workTypeLabel, memo.replace(/\s+/g, ' ').trim()].filter(Boolean).join('_');
        const fileName = (meta || `site_photo_${i}`).slice(0, 200);
        const { error } = await supabase.from('t_photos').insert({
          project_id: projectId,
          type: photoPhase,
          file_id: fakeFileId,
          drive_url: dataUrl,
          thumbnail_url: dataUrl,
          file_name: fileName || null,
          uploaded_by: user.id,
        });
        if (error) throw error;
      }
      showToast(`${photos.length}枚の写真を登録しました`, 'success');
      setProjectId('');
      setPhotoDate(today());
      setPhotoPhase(phaseOptions[0] ?? '');
      setMemo('');
      setPhotos([]);
    } catch (e) {
      showToast('登録に失敗しました: ' + String(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <LoadingOverlay show={loading} message="アップロード中..." />
      <Toast toasts={toasts} onRemove={removeToast} />

      <div className="form-card">
        <h3 className="section-title">
          <span className="material-icons text-line-green">photo_library</span>
          現場写真登録
        </h3>

        <div className="form-field">
          <label>案件 *</label>
          <select value={projectId} onChange={(e) => handleProjectChange(e.target.value)}>
            <option value="">案件を選択</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_number} {p.customer_name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label>撮影日</label>
          <input type="date" value={photoDate} onChange={(e) => setPhotoDate(e.target.value)} />
        </div>

        <div className="form-field">
          <label>撮影フェーズ</label>
          <p className="text-xs text-gray-500 mb-1">管理画面の「マスター管理」で追加・変更できます。</p>
          <select value={photoPhase} onChange={(e) => setPhotoPhase(e.target.value)}>
            {phaseOptions.length === 0 ? (
              <option value="">読み込み中...</option>
            ) : (
              phaseOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))
            )}
          </select>
        </div>

        <div className="form-field">
          <label>工事種別</label>
          <p className="text-xs text-gray-500 mb-1">選択中の案件に登録されている工事種別です（自動表示）。</p>
          <input
            type="text"
            readOnly
            tabIndex={-1}
            value={
              !projectId
                ? ''
                : workTypeLabel || '（案件に工事種別が未設定です）'
            }
            placeholder="案件を選択してください"
            className="bg-gray-50 text-gray-800 cursor-default"
          />
        </div>

        <div className="form-field">
          <label>メモ</label>
          <div className="relative">
            <textarea
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="場所や内容を入力、または音声入力"
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

        <button
          className="btn-format mb-4"
          onClick={async () => {
            if (!memo.trim()) { showToast('整形する文章がありません', 'error'); return; }
            setFormatting(true);
            try {
              const result = await callFormatText(memo, 'site_photo');
              setMemo(result);
              showToast('AI整形しました', 'success');
            } catch {
              showToast('AI整形に失敗しました', 'error');
            }
            setFormatting(false);
          }}
          type="button"
          disabled={formatting}
        >
          <span className="material-icons text-base text-purple-500">auto_fix_high</span>
          {formatting ? 'AI整形中...' : 'AI整形'}
        </button>

        {/* アップロードエリア */}
        <div
          className="flex flex-col items-center justify-center gap-2 p-6 mb-3 rounded-xl cursor-pointer"
          style={{ border: '2px dashed #d1d5db' }}
          onClick={() => uploadInputRef.current?.click()}
        >
          <span className="material-icons text-gray-400 text-4xl">cloud_upload</span>
          <p className="text-sm font-medium text-gray-600">タップして写真を選択</p>
          <p className="text-xs text-gray-400">複数選択可（最大10枚）</p>
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handlePhotoSelect(e.target.files)}
        />

        {/* 写真グリッド */}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {photos.map((photo, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden" style={{ aspectRatio: '1' }}>
                <img src={photo} alt="" className="w-full h-full object-cover" />
                <button
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                >
                  <span className="material-icons text-[12px]">close</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {photos.length > 0 && (
          <button className="btn-line-action" onClick={handleUpload}>
            <span className="material-icons text-base">cloud_upload</span>
            アップロード（{photos.length}枚）
          </button>
        )}
      </div>
    </>
  );
}
