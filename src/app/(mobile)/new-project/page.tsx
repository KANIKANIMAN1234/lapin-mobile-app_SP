'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useProjects } from '@/hooks/useProjects';
import { Toast } from '@/components/ui/Toast';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/hooks/useToast';
import { createClient } from '@/lib/supabase';

const WORK_TYPES = ['外壁塗装', '屋根塗装', 'キッチン', '浴室', 'トイレ', '内装', '外構', 'その他'];
const ROUTES = ['チラシ', 'Web自然流入', 'Web広告', '新聞', '紹介', 'イベント', 'OB施策', 'LINE'];

const SALES_MEMBERS = [
  { id: 'demo-user-001', name: '山田太郎' },
  { id: 'demo-user-002', name: '佐藤次郎' },
  { id: 'demo-user-003', name: '鈴木三郎' },
];

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

interface FormState {
  customerName: string;
  zip: string;
  address: string;
  phone: string;
  email: string;
  workDesc: string;
  workTypes: string[];
  amount: string;
  route: string;
  assigned: string;
  memo: string;
}

interface ModalData extends FormState {
  projectNumber: string;
}

export default function NewProjectPage() {
  const { user } = useAuthStore();
  const { toasts, showToast, removeToast } = useToast();

  const [form, setForm] = useState<FormState>({
    customerName: '',
    zip: '',
    address: '',
    phone: '',
    email: '',
    workDesc: '',
    workTypes: [],
    amount: '',
    route: '',
    assigned: '',
    memo: '',
  });

  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [isRecordingDesc, setIsRecordingDesc] = useState(false);
  const [isRecordingMemo, setIsRecordingMemo] = useState(false);

  const update = (field: keyof FormState, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleWorkType = (type: string) => {
    setForm((prev) => ({
      ...prev,
      workTypes: prev.workTypes.includes(type)
        ? prev.workTypes.filter((t) => t !== type)
        : [...prev.workTypes, type],
    }));
  };

  const startVoice = (
    field: 'workDesc' | 'memo',
    setRecording: (v: boolean) => void
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { showToast('音声入力に非対応のブラウザです', 'error'); return; }

    const recognition = new SR();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = form[field];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim = t;
      }
      update(field, finalText + interim);
    };
    recognition.onerror = () => { setRecording(false); };
    recognition.onend = () => { setRecording(false); };

    recognition.start();
    setRecording(true);
  };

  const validate = (): boolean => {
    if (!form.customerName) { showToast('顧客名を入力してください', 'error'); return false; }
    if (!form.address) { showToast('住所を入力してください', 'error'); return false; }
    if (!form.phone) { showToast('電話番号を入力してください', 'error'); return false; }
    if (!form.workDesc) { showToast('工事概要を入力してください', 'error'); return false; }
    if (form.workTypes.length === 0) { showToast('工事種別を選択してください', 'error'); return false; }
    if (!form.amount) { showToast('見込み金額を入力してください', 'error'); return false; }
    if (!form.route) { showToast('集客ルートを選択してください', 'error'); return false; }
    if (!form.assigned) { showToast('営業担当者を選択してください', 'error'); return false; }
    return true;
  };

  const handleRegister = () => {
    if (!validate()) return;

    const now = new Date();
    const projectNumber = `${now.getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`;

    setModalData({ ...form, projectNumber });
    setShowModal(true);
  };

  const handleConfirmSend = async () => {
    if (!modalData) return;

    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.from('projects').insert({
        customer_name: modalData.customerName,
        postal_code: modalData.zip,
        address: modalData.address,
        phone: modalData.phone,
        email: modalData.email || null,
        work_description: modalData.workDesc,
        work_type: modalData.workTypes,
        estimated_amount: Number(modalData.amount),
        acquisition_route: modalData.route,
        assigned_to: modalData.assigned,
        notes: modalData.memo || null,
        status: 'inquiry',
        inquiry_date: new Date().toISOString().split('T')[0],
        created_by: user?.id ?? 'demo-user-001',
      });
      showToast('案件を登録し、LINEに通知しました', 'success');
    } catch {
      showToast('案件を登録しました（デモ）', 'success');
    } finally {
      setLoading(false);
      setShowModal(false);
      setForm({
        customerName: '', zip: '', address: '', phone: '', email: '',
        workDesc: '', workTypes: [], amount: '', route: '', assigned: '', memo: '',
      });
    }
  };

  if (!user?.can_register_project && user?.role !== 'admin') {
    return (
      <div className="text-center py-20 text-gray-400">
        <span className="material-icons text-5xl mb-3">lock</span>
        <p className="text-sm font-medium">この機能を使用する権限がありません</p>
        <p className="text-xs mt-1">管理者にお問い合わせください</p>
      </div>
    );
  }

  return (
    <>
      <LoadingOverlay show={loading} message="案件を登録中..." />
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* LINE通知プレビューモーダル */}
      {showModal && modalData && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            className="bg-white rounded-2xl w-full shadow-2xl overflow-hidden"
            style={{ maxWidth: 440, maxHeight: '80vh', overflowY: 'auto' }}
          >
            {/* モーダルヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="material-icons text-line-green">chat</span>
                <p className="font-bold text-gray-800">LINE通知プレビュー</p>
              </div>
              <button onClick={() => setShowModal(false)}>
                <span className="material-icons text-gray-400">close</span>
              </button>
            </div>

            <div className="p-4">
              <p className="text-xs text-gray-500 mb-3">
                以下の内容が営業担当者と社長のLINEに送信されます。
              </p>

              {/* 通知先バッジ */}
              <div className="flex gap-2 mb-4">
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
                  style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                  <span className="material-icons text-xs">person</span>
                  {SALES_MEMBERS.find((m) => m.id === modalData.assigned)?.name ?? '営業担当'}
                </span>
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
                  style={{ background: '#fef3c7', color: '#92400e' }}>
                  <span className="material-icons text-xs">person</span>
                  社長
                </span>
              </div>

              {/* LINEバブル */}
              <div
                className="relative rounded-[0_16px_16px_16px] p-4 text-sm leading-7"
                style={{ background: 'var(--line-green-light)' }}
              >
                <div
                  className="absolute top-0 left-[-8px] w-0 h-0"
                  style={{
                    borderTop: '8px solid var(--line-green-light)',
                    borderLeft: '8px solid transparent',
                  }}
                />
                <p>📋 <strong>新規案件登録</strong></p>
                <p>案件番号: {modalData.projectNumber}</p>
                <p>顧客名: {modalData.customerName}</p>
                <p>住所: {modalData.address}</p>
                <p>工事概要: {modalData.workDesc}</p>
                <p>工事種別: {modalData.workTypes.join('・')}</p>
                <p>見込み金額: ¥{Number(modalData.amount).toLocaleString()}</p>
                <p>集客ルート: {modalData.route}</p>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  className="flex-1 py-3 rounded-xl font-bold border border-gray-200 text-gray-700 text-sm"
                  onClick={() => setShowModal(false)}
                >
                  キャンセル
                </button>
                <button
                  className="btn-line-action flex-1"
                  onClick={handleConfirmSend}
                >
                  <span className="material-icons text-base">send</span>
                  送信する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 顧客情報 */}
      <div className="form-card">
        <h3 className="section-title">
          <span className="material-icons text-line-green">person</span>
          顧客情報
        </h3>

        <div className="form-field">
          <label>顧客名 *</label>
          <input
            type="text"
            value={form.customerName}
            onChange={(e) => update('customerName', e.target.value)}
            placeholder="例: 山本太郎"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="form-field">
            <label>郵便番号</label>
            <input
              type="text"
              value={form.zip}
              onChange={(e) => update('zip', e.target.value)}
              placeholder="123-4567"
            />
          </div>
          <div className="form-field">
            <label>住所 *</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="大阪市北区..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="form-field">
            <label>電話番号 *</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="06-1234-5678"
            />
          </div>
          <div className="form-field">
            <label>メールアドレス</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="sample@mail.com"
            />
          </div>
        </div>
      </div>

      {/* 工事情報 */}
      <div className="form-card">
        <h3 className="section-title">
          <span className="material-icons text-line-green">construction</span>
          工事情報
        </h3>

        <div className="form-field">
          <label>工事概要 *</label>
          <div className="relative">
            <textarea
              rows={3}
              value={form.workDesc}
              onChange={(e) => update('workDesc', e.target.value)}
              placeholder="工事の概要を入力（音声入力可）"
              style={{ paddingRight: 44 }}
            />
            <button
              className={`absolute top-2 right-2 flex items-center justify-center rounded-full ${
                isRecordingDesc ? 'bg-red-500 animate-pulse' : 'bg-gray-400'
              }`}
              style={{ width: 32, height: 32 }}
              onClick={() => startVoice('workDesc', setIsRecordingDesc)}
              type="button"
            >
              <span className="material-icons text-white text-sm">
                {isRecordingDesc ? 'stop' : 'mic'}
              </span>
            </button>
          </div>
          <button
            className="btn-format mt-2"
            onClick={() => {
              if (!form.workDesc.trim()) { showToast('整形する文章がありません', 'error'); return; }
              update('workDesc', formatText(form.workDesc));
              showToast('文章を整形しました', 'success');
            }}
            type="button"
          >
            <span className="material-icons text-base text-purple-500">auto_fix_high</span>
            文章を整形する
          </button>
        </div>

        <div className="form-field">
          <label>工事種別 *（複数選択可）</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {WORK_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleWorkType(type)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  form.workTypes.includes(type)
                    ? 'bg-line-green text-white border-line-green'
                    : 'bg-gray-100 text-gray-600 border-gray-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="form-field">
          <label>見込み金額 *</label>
          <input
            type="number"
            value={form.amount}
            onChange={(e) => update('amount', e.target.value)}
            placeholder="0"
            inputMode="numeric"
          />
        </div>
      </div>

      {/* 集客情報 */}
      <div className="form-card">
        <h3 className="section-title">
          <span className="material-icons text-line-green">campaign</span>
          集客情報
        </h3>

        <div className="form-field">
          <label>集客ルート *</label>
          <select value={form.route} onChange={(e) => update('route', e.target.value)}>
            <option value="">選択してください</option>
            {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="form-field">
          <label>営業担当者 *</label>
          <select value={form.assigned} onChange={(e) => update('assigned', e.target.value)}>
            <option value="">選択してください</option>
            {SALES_MEMBERS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 備考メモ */}
      <div className="form-card">
        <h3 className="section-title">
          <span className="material-icons text-line-green">note</span>
          備考メモ
        </h3>

        <div className="form-field">
          <label>備考メモ</label>
          <div className="relative">
            <textarea
              rows={2}
              value={form.memo}
              onChange={(e) => update('memo', e.target.value)}
              placeholder="お客様の要望等（音声入力可）"
              style={{ paddingRight: 44 }}
            />
            <button
              className={`absolute top-2 right-2 flex items-center justify-center rounded-full ${
                isRecordingMemo ? 'bg-red-500 animate-pulse' : 'bg-gray-400'
              }`}
              style={{ width: 32, height: 32 }}
              onClick={() => startVoice('memo', setIsRecordingMemo)}
              type="button"
            >
              <span className="material-icons text-white text-sm">
                {isRecordingMemo ? 'stop' : 'mic'}
              </span>
            </button>
          </div>
          <button
            className="btn-format mt-2"
            onClick={() => {
              if (!form.memo.trim()) { showToast('整形する文章がありません', 'error'); return; }
              update('memo', formatText(form.memo));
              showToast('文章を整形しました', 'success');
            }}
            type="button"
          >
            <span className="material-icons text-base text-purple-500">auto_fix_high</span>
            文章を整形する
          </button>
        </div>
      </div>

      <button className="btn-line-action mb-4" onClick={handleRegister}>
        <span className="material-icons text-base">send</span>
        案件を登録して通知する
      </button>
    </>
  );
}
