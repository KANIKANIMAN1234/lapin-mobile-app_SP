'use client';

import { useState, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useProjects } from '@/hooks/useProjects';
import { useCreateExpense } from '@/hooks/useExpenses';
import { Toast } from '@/components/ui/Toast';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/hooks/useToast';
import type { AiCandidate, ExpenseCategory } from '@/types';

const CATEGORIES: ExpenseCategory[] = ['材料費', '交通費', '外注費', '消耗品費', '飲食費', 'その他'];

const today = () => new Date().toISOString().split('T')[0];

// OCRシミュレーション用
const OCR_RESULTS = [
  { amount: '12500', memo: 'ペンキ・刷毛類' },
  { amount: '3200', memo: '交通費（電車）' },
  { amount: '8800', memo: '打ち合わせ飲食費' },
];

export default function ExpensePage() {
  const { user } = useAuthStore();
  const { data: projects = [] } = useProjects();
  const createExpense = useCreateExpense();
  const { toasts, showToast, removeToast } = useToast();

  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [ocrVisible, setOcrVisible] = useState(false);
  const [aiCandidates, setAiCandidates] = useState<AiCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<ExpenseCategory>('材料費');
  const [memo, setMemo] = useState('');
  const [projectId, setProjectId] = useState('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const handleImages = useCallback((files: FileList) => {
    const newImages: string[] = [];
    const remaining = 3 - previewImages.length;
    const toProcess = Math.min(files.length, remaining);

    Array.from(files).slice(0, toProcess).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newImages.push(e.target?.result as string);
        if (newImages.length === toProcess) {
          setPreviewImages((prev) => [...prev, ...newImages]);
          // OCRシミュレーション
          setTimeout(() => {
            setLoadingMsg('OCR読み取り中...');
            setLoading(true);
            setTimeout(() => {
              setLoading(false);
              const ocrResult = OCR_RESULTS[Math.floor(Math.random() * OCR_RESULTS.length)];
              setAmount(ocrResult.amount);
              setMemo(ocrResult.memo);
              setOcrVisible(true);

              // AI候補
              const candidates: AiCandidate[] = projects.slice(0, 3).map((p, i) => ({
                project_id: p.id,
                project_number: p.project_number,
                customer_name: p.customer_name,
                confidence: 90 - i * 15,
                reason: i === 0 ? 'レシートの住所が一致' : i === 1 ? '作業日程が重複' : '過去の経費パターン',
              }));
              setAiCandidates(candidates);
            }, 1500);
          }, 500);
        }
      };
      reader.readAsDataURL(file);
    });
  }, [previewImages.length, projects]);

  const removeImage = (idx: number) => {
    const next = previewImages.filter((_, i) => i !== idx);
    setPreviewImages(next);
    if (next.length === 0) {
      setOcrVisible(false);
      setAiCandidates([]);
    }
  };

  const handleCandidateSelect = (candidate: AiCandidate) => {
    setSelectedCandidateId(candidate.project_id);
    setProjectId(candidate.project_id);
  };

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) {
      showToast('金額を入力してください', 'error');
      return;
    }

    setLoadingMsg('スプレッドシートに登録中...');
    setLoading(true);

    try {
      await createExpense.mutateAsync({
        project_id: projectId || undefined,
        amount: Number(amount),
        date,
        category,
        memo,
        user_id: user?.id ?? 'demo-user-001',
      });
      showToast('経費を登録しました', 'success');
      // フォームリセット
      setAmount('');
      setDate(today());
      setCategory('材料費');
      setMemo('');
      setProjectId('');
      setPreviewImages([]);
      setOcrVisible(false);
      setAiCandidates([]);
      setSelectedCandidateId('');
    } catch {
      // デモモードでも成功扱い
      showToast('経費を登録しました（デモ）', 'success');
      setAmount('');
      setDate(today());
      setMemo('');
      setProjectId('');
      setPreviewImages([]);
      setOcrVisible(false);
      setAiCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <LoadingOverlay show={loading} message={loadingMsg} />
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* レシートカード */}
      <div className="form-card">
        <h3 className="section-title">
          <span className="material-icons text-line-green">photo_camera</span>
          レシート・領収書
        </h3>

        {/* 撮影エリア */}
        <div
          className="flex flex-col items-center justify-center gap-2 p-6 mb-3 rounded-xl cursor-pointer"
          style={{ border: '2px dashed var(--line-green)', background: 'var(--line-green-light)' }}
          onClick={() => cameraInputRef.current?.click()}
        >
          <span className="material-icons text-line-green text-4xl">receipt_long</span>
          <p className="text-sm font-bold text-line-green">レシート・領収書を撮影</p>
          <p className="text-xs text-gray-500">タップしてカメラを起動</p>
        </div>

        <div className="flex gap-2">
          <button className="btn-sub flex-1" onClick={() => cameraInputRef.current?.click()}>
            <span className="material-icons text-base">camera_alt</span> 撮影
          </button>
          <button className="btn-sub flex-1" onClick={() => libraryInputRef.current?.click()}>
            <span className="material-icons text-base">photo_library</span> ライブラリ
          </button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files && handleImages(e.target.files)}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleImages(e.target.files)}
        />

        {previewImages.length > 0 && (
          <div className="preview-container">
            {previewImages.map((src, i) => (
              <div key={i} className="preview-item">
                <img src={src} alt={`レシート${i + 1}`} />
                <button
                  className="remove-btn"
                  onClick={() => removeImage(i)}
                >
                  <span className="material-icons text-[12px]">close</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {ocrVisible && (
          <div className="mt-3 p-3 rounded-xl flex items-start gap-2" style={{ background: '#fef3c7' }}>
            <span className="material-icons text-yellow-600 text-base">auto_awesome</span>
            <div>
              <p className="text-xs font-bold text-yellow-800">OCR自動読み取り結果</p>
              <p className="text-xs text-yellow-700 mt-0.5">金額・備考を自動入力しました</p>
            </div>
          </div>
        )}
      </div>

      {/* 経費情報カード */}
      <div className="form-card">
        <h3 className="section-title">
          <span className="material-icons text-line-green">edit_note</span>
          経費情報
        </h3>

        {/* AI候補 */}
        {aiCandidates.length > 0 && (
          <div className="mb-3 p-3 rounded-xl bg-purple-50 border border-purple-100">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="material-icons text-purple-600 text-base">psychology</span>
              <p className="text-xs font-bold text-purple-700">AI案件候補</p>
            </div>
            <div className="flex flex-col gap-2">
              {aiCandidates.map((c) => (
                <label
                  key={c.project_id}
                  className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border-2 transition-all ${
                    selectedCandidateId === c.project_id
                      ? 'border-line-green bg-line-green-light'
                      : 'border-gray-200 bg-white'
                  }`}
                  onClick={() => handleCandidateSelect(c)}
                >
                  <input
                    type="radio"
                    name="ai-candidate"
                    className="mt-0.5"
                    checked={selectedCandidateId === c.project_id}
                    onChange={() => handleCandidateSelect(c)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-gray-800 truncate">
                        {c.project_number} {c.customer_name}
                      </p>
                      <span className="shrink-0 text-[0.65rem] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                        {c.confidence}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{c.reason}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="form-field">
          <label>案件</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">共通経費（案件なし）</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_number} {p.customer_name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label>金額 *</label>
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="form-field">
          <label>日付</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label>カテゴリ</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label>備考</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="品目や用途を入力"
          />
        </div>

        <button
          className="btn-submit mt-2"
          onClick={handleSubmit}
          disabled={loading || !user}
        >
          <span className="material-icons text-base">cloud_upload</span>
          {user ? 'スプレッドシートに登録' : '認証中...'}
        </button>
      </div>
    </>
  );
}
