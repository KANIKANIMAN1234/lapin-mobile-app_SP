'use client';

import { useState, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useProjects } from '@/hooks/useProjects';
import { useCreateExpense } from '@/hooks/useExpenses';
import { Toast } from '@/components/ui/Toast';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/hooks/useToast';
import type { ExpenseCategory } from '@/types';

const CATEGORIES: ExpenseCategory[] = ['材料費', '交通費', '外注費', '消耗品費', '接待交際費', '通信費', '駐車場代', 'その他'];

const today = () => new Date().toISOString().split('T')[0];

export default function ExpensePage() {
  const { user } = useAuthStore();
  const { data: projects = [] } = useProjects();
  const createExpense = useCreateExpense();
  const { toasts, showToast, removeToast } = useToast();

  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(today());
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
        }
      };
      reader.readAsDataURL(file);
    });
  }, [previewImages.length]);

  const removeImage = (idx: number) => {
    setPreviewImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      showToast('ログイン情報が取得できません。再度ログインしてください。', 'error');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      showToast('金額を入力してください', 'error');
      return;
    }

    setLoadingMsg('登録中...');
    setLoading(true);

    try {
      await createExpense.mutateAsync({
        project_id: projectId || undefined,
        amount: Number(amount),
        expense_date: expenseDate,
        category,
        memo,
        user_id: user.id,
        status: 'pending',
      });
      showToast('経費を登録しました', 'success');
      setAmount('');
      setExpenseDate(today());
      setCategory('材料費');
      setMemo('');
      setProjectId('');
      setPreviewImages([]);
    } catch (err) {
      console.error('[ExpensePage] createExpense', err);
      showToast('経費の登録に失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <LoadingOverlay show={loading} message={loadingMsg} />
      <Toast toasts={toasts} onRemove={removeToast} />

      <div className="form-card">
        <h3 className="section-title">
          <span className="material-icons text-line-green">photo_camera</span>
          レシート・領収書
        </h3>

        <div
          className="flex flex-col items-center justify-center gap-2 p-6 mb-3 rounded-xl cursor-pointer"
          style={{ border: '2px dashed var(--line-green)', background: 'var(--line-green-light)' }}
          onClick={() => cameraInputRef.current?.click()}
        >
          <span className="material-icons text-line-green text-4xl">receipt_long</span>
          <p className="text-sm font-bold text-line-green">レシート・領収書を撮影</p>
          <p className="text-xs text-gray-500">タップしてカメラを起動（プレビュー用・登録時は金額等を手入力）</p>
        </div>

        <div className="flex gap-2">
          <button type="button" className="btn-sub flex-1" onClick={() => cameraInputRef.current?.click()}>
            <span className="material-icons text-base">camera_alt</span> 撮影
          </button>
          <button type="button" className="btn-sub flex-1" onClick={() => libraryInputRef.current?.click()}>
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
                <button type="button" className="remove-btn" onClick={() => removeImage(i)}>
                  <span className="material-icons text-[12px]">close</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="form-card">
        <h3 className="section-title">
          <span className="material-icons text-line-green">edit_note</span>
          経費情報
        </h3>

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
          <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
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
          type="button"
          className="btn-submit mt-2"
          onClick={handleSubmit}
          disabled={loading || !user}
        >
          <span className="material-icons text-base">cloud_upload</span>
          {user ? '経費を登録' : '認証中...'}
        </button>
      </div>
    </>
  );
}
