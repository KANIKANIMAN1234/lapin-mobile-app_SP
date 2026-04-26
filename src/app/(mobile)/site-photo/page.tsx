'use client';

import { useState, useRef } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { useAuthStore } from '@/stores/authStore';
import { Toast } from '@/components/ui/Toast';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/hooks/useToast';
import type { PhotoCategory } from '@/types';

const PHOTO_CATEGORIES: PhotoCategory[] = [
  '契約前', '現調', '施工前', '下地', '施工中', '施工後', '完工', 'その他'
];

const WORK_TYPES_MAP: Record<string, string[]> = {
  '外壁塗装': ['下塗り', '中塗り', '上塗り', '養生'],
  '屋根塗装': ['洗浄', '下塗り', '上塗り'],
  'キッチン': ['解体', '給排水', '設備取付', '仕上げ'],
  '浴室': ['解体', '防水', '設備取付', '仕上げ'],
  'トイレ': ['解体', '設備取付', '仕上げ'],
  '内装': ['解体', '下地', '壁紙', '床材', '仕上げ'],
  '外構': ['基礎', '舗装', 'フェンス', '植栽'],
  'その他': ['その他'],
};

const today = () => new Date().toISOString().split('T')[0];

function formatText(text: string): string {
  return text
    .replace(/。(?!\n)/g, '。\n')
    .replace(/[、、]+/g, '、')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/[。）)\]】]$/.test(line) ? line : line + '。'))
    .join('\n');
}

export default function SitePhotoPage() {
  const { user } = useAuthStore();
  const { data: projects = [] } = useProjects();
  const { toasts, showToast, removeToast } = useToast();

  const [projectId, setProjectId] = useState('');
  const [photoDate, setPhotoDate] = useState(today());
  const [category, setCategory] = useState<PhotoCategory>('施工中');
  const [workType, setWorkType] = useState('');
  const [availableWorkTypes, setAvailableWorkTypes] = useState<string[]>([]);
  const [memo, setMemo] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const handleProjectChange = (id: string) => {
    setProjectId(id);
    const project = projects.find((p) => p.id === id);
    if (project && project.work_type.length > 0) {
      const types = project.work_type.flatMap((wt) => WORK_TYPES_MAP[wt] ?? [wt]);
      setAvailableWorkTypes([...new Set(types)]);
      setWorkType('');
    } else {
      setAvailableWorkTypes([]);
      setWorkType('');
    }
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

    let finalText = memo;
    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim = t;
      }
      setMemo(finalText + interim);
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

  const handleUpload = async () => {
    if (!projectId) {
      showToast('案件を選択してください', 'error');
      return;
    }
    if (photos.length === 0) {
      showToast('写真を選択してください', 'error');
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    setLoading(false);
    showToast(`${photos.length}枚の写真をアップロードしました`, 'success');
    setProjectId('');
    setPhotoDate(today());
    setCategory('施工中');
    setWorkType('');
    setMemo('');
    setPhotos([]);
    setAvailableWorkTypes([]);
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
          <label>カテゴリ</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as PhotoCategory)}>
            {PHOTO_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label>工事種別</label>
          <select
            value={workType}
            onChange={(e) => setWorkType(e.target.value)}
            disabled={availableWorkTypes.length === 0}
          >
            <option value="">
              {availableWorkTypes.length === 0 ? '案件を選択してください' : '種別を選択'}
            </option>
            {availableWorkTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
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

        <button
          className="btn-format mb-4"
          onClick={() => {
            if (!memo.trim()) { showToast('整形する文章がありません', 'error'); return; }
            setMemo(formatText(memo));
            showToast('文章を整形しました', 'success');
          }}
          type="button"
        >
          <span className="material-icons text-base">auto_fix_high</span>
          文章を整形
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
