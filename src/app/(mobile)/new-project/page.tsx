'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Toast } from '@/components/ui/Toast';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/hooks/useToast';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { createClient } from '@/lib/supabase';

const WORK_TYPES = ['外壁塗装', '屋根塗装', 'キッチン', '浴室', 'トイレ', '内装', '外構', 'その他'];
const ROUTES = ['チラシ', 'Web自然流入', 'Web広告', '新聞', '紹介', 'イベント', 'OB施策', 'LINE'];

function todayStr() {
  return new Date().toISOString().split('T')[0];
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

interface Employee {
  id: string;
  name: string;
  role: string;
  line_user_id?: string | null;
}

interface FormState {
  customerName: string;
  customerNameKana: string;
  zip: string;
  address: string;
  phone: string;
  email: string;
  workDesc: string;
  workTypes: string[];
  amount: string;
  inquiryDate: string;
  route: string;
  assigned: string;
  memo: string;
}

interface ModalData extends FormState {
  assignedName: string;
}

export default function NewProjectPage() {
  const { user } = useAuthStore();
  const { toasts, showToast, removeToast } = useToast();

  const [form, setForm] = useState<FormState>({
    customerName: '',
    customerNameKana: '',
    zip: '',
    address: '',
    phone: '',
    email: '',
    workDesc: '',
    workTypes: [],
    amount: '',
    inquiryDate: todayStr(),
    route: '',
    assigned: '',
    memo: '',
  });

  const [employees, setEmployees] = useState<Employee[]>([]);
  /** 新規顧客 vs 既存顧客（リピート）。モバイルは縦並びレイアウトで表示 */
  const [registrationKind, setRegistrationKind] = useState<'new' | 'existing'>('new');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    isRecording: isRecordingDesc,
    voiceStatus,
    toggleVoice: handleVoiceToggle,
    transcribing: voiceTranscribing,
  } = useVoiceInput({
    currentText: form.workDesc,
    onTextUpdate: (text) => setForm((prev) => ({ ...prev, workDesc: text })),
    onError: (msg) => showToast(msg, 'error'),
  });

  // 従業員一覧をSupabaseから取得
  useEffect(() => {
    async function fetchEmployees() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('m_users')
          .select('id, name, role, line_user_id')
          .eq('status', 'active')
          .order('name');
        if (error) {
          console.error('[new-project] fetchEmployees', error);
          setEmployees([]);
          return;
        }
        setEmployees((data ?? []) as Employee[]);
      } catch (e) {
        console.error('[new-project] fetchEmployees', e);
        setEmployees([]);
      }
    }
    void fetchEmployees();
  }, []);

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


  const validate = (): boolean => {
    if (!form.customerName) { showToast('顧客名を入力してください', 'error'); return false; }
    if (!form.address) { showToast('住所を入力してください', 'error'); return false; }
    if (!form.phone) { showToast('電話番号を入力してください', 'error'); return false; }
    if (form.workTypes.length === 0) { showToast('工事種別を選択してください', 'error'); return false; }
    if (!form.amount) { showToast('見込み金額を入力してください', 'error'); return false; }
    if (!form.route) { showToast('取得経路を選択してください', 'error'); return false; }
    return true;
  };

  const handleRegister = () => {
    if (!validate()) return;
    const assignedEmployee = employees.find((e) => e.id === form.assigned);
    setModalData({ ...form, assignedName: assignedEmployee?.name ?? '' });
    setShowModal(true);
  };

  const handleConfirmSend = async () => {
    if (!modalData) return;
    if (!user?.id) {
      showToast('ログイン情報が取得できません。再度ログインしてください。', 'error');
      return;
    }
    setSubmitting(true);
    setLoading(true);

    try {
      const supabase = createClient();

      // ── 案件をDBに登録（project_numberはオプション扱い）──────
      const { data: insertedData, error: insertError } = await supabase
        .from('t_projects')
        .insert({
          customer_name: modalData.customerName,
          customer_name_kana: modalData.customerNameKana || null,
          postal_code: modalData.zip || null,
          address: modalData.address,
          phone: modalData.phone,
          email: modalData.email || null,
          work_description: modalData.workDesc || modalData.workTypes.join(','),
          work_type: modalData.workTypes,
          estimated_amount: Number(modalData.amount),
          acquisition_route: modalData.route,
          assigned_to: modalData.assigned || null,
          notes: modalData.memo || null,
          status: 'inquiry',
          inquiry_date: modalData.inquiryDate,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // ── LINE通知を送信 ──────────────────────────────────────
      const assignedEmployee = employees.find((e) => e.id === modalData.assigned);
      const adminEmployees = employees.filter((e) => e.role === 'admin' && e.line_user_id);

      console.log('[new-project] line-notify payload:', {
        customerName: modalData.customerName,
        assignedEmployee: assignedEmployee?.name,
        assignedLineUserId: assignedEmployee?.line_user_id,
        adminCount: adminEmployees.length,
        insertedId: (insertedData as { id?: string })?.id,
      });

      try {
        const notifyRes = await fetch('/api/line-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: modalData.customerName,
            address: modalData.address,
            workDescription: modalData.workDesc || undefined,
            workType: modalData.workTypes,
            estimatedAmount: Number(modalData.amount),
            acquisitionRoute: modalData.route,
            inquiryDate: modalData.inquiryDate,
            assignedUserName: assignedEmployee?.name ?? undefined,
            assignedLineUserId: assignedEmployee?.line_user_id ?? undefined,
            adminLineUserIds: adminEmployees.map((e) => e.line_user_id!),
          }),
        });
        const notifyJson = await notifyRes.json();
        console.log('[new-project] line-notify result:', notifyJson);
        if (!notifyRes.ok || !notifyJson.success) {
          showToast('案件を登録しました（LINE通知に失敗: ' + (notifyJson.error ?? notifyRes.status) + '）', 'error');
        } else {
          showToast('案件を登録し、LINEに通知しました', 'success');
        }
      } catch (notifyErr) {
        console.error('[new-project] line-notify fetch error:', notifyErr);
        showToast('案件を登録しました（LINE通知に失敗しました）', 'error');
      }
    } catch (err) {
      console.error('[new-project] insert error:', err);
      showToast('案件の登録に失敗しました', 'error');
    } finally {
      setLoading(false);
      setShowModal(false);
      setSubmitting(false);
      setForm({
        customerName: '', customerNameKana: '', zip: '', address: '',
        phone: '', email: '', workDesc: '', workTypes: [], amount: '',
        inquiryDate: todayStr(), route: '', assigned: '', memo: '',
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
                以下の内容が{modalData.assignedName ? '担当者と' : ''}社長のLINEに送信されます。
              </p>

              <div className="flex gap-2 mb-4 flex-wrap">
                {modalData.assignedName && (
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
                    style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                    <span className="material-icons text-xs">person</span>
                    {modalData.assignedName}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
                  style={{ background: '#fef3c7', color: '#92400e' }}>
                  <span className="material-icons text-xs">person</span>
                  社長
                </span>
              </div>

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
                <p>顧客名: {modalData.customerName}{modalData.customerNameKana ? `（${modalData.customerNameKana}）` : ''}</p>
                <p>住所: {modalData.address}</p>
                <p>電話: {modalData.phone}</p>
                {modalData.workDesc && <p>工事内容: {modalData.workDesc}</p>}
                <p>工事種別: {modalData.workTypes.join('・')}</p>
                <p>見込み金額: ¥{Number(modalData.amount).toLocaleString()}</p>
                <p>取得経路: {modalData.route}</p>
                <p>問い合わせ日: {modalData.inquiryDate}</p>
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
                  disabled={submitting}
                >
                  <span className="material-icons text-base">send</span>
                  {submitting ? '登録中...' : '送信する'}
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
          <span className="ml-auto px-2 py-0.5 text-[10px] bg-red-50 text-red-600 rounded font-bold">管理者</span>
        </h3>

        <div className="form-field">
          <label className="mb-2 block">登録区分</label>
          <div className="flex flex-col gap-3">
            <label
              className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                registrationKind === 'new'
                  ? 'border-line-green bg-[var(--line-green-light)]'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <input
                type="radio"
                name="registration-kind"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#06C755]"
                checked={registrationKind === 'new'}
                onChange={() => setRegistrationKind('new')}
              />
              <span className="min-w-0 flex-1 text-sm leading-snug text-gray-900">
                新規顧客<span className="text-gray-600">（初回のご依頼）</span>
              </span>
            </label>
            <label
              className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                registrationKind === 'existing'
                  ? 'border-line-green bg-[var(--line-green-light)]'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <input
                type="radio"
                name="registration-kind"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#06C755]"
                checked={registrationKind === 'existing'}
                onChange={() => setRegistrationKind('existing')}
              />
              <div className="min-w-0 flex-1 text-sm leading-snug text-gray-900">
                <span className="font-medium">既存顧客</span>
                <span className="text-gray-600">（追加・リピート工事）</span>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
                  下の「氏名または会社名」に入力すると候補が表示されます。候補から選択してください。
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="form-field">
          <label>顧客名 *</label>
          <input
            type="text"
            value={form.customerName}
            onChange={(e) => update('customerName', e.target.value)}
            placeholder="氏名または会社名"
          />
        </div>

        <div className="form-field">
          <label>顧客名（カナ）</label>
          <input
            type="text"
            value={form.customerNameKana}
            onChange={(e) => update('customerNameKana', e.target.value)}
            placeholder="カナ（任意）"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="form-field">
            <label>郵便番号</label>
            <input
              type="text"
              value={form.zip}
              onChange={(e) => update('zip', e.target.value)}
              placeholder="530-0001"
            />
          </div>
          <div className="form-field col-span-2">
            <label>住所 *</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="大阪府大阪市北区..."
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
            <label>メール</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="sample@mail.com"
            />
          </div>
        </div>
      </div>

      {/* 案件情報 */}
      <div className="form-card">
        <h3 className="section-title">
          <span className="material-icons text-line-green">assignment</span>
          案件情報
        </h3>

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
          <label>工事内容</label>
          <div className="relative">
            <textarea
              rows={2}
              value={form.workDesc}
              onChange={(e) => update('workDesc', e.target.value)}
              placeholder="工事の概要を入力（音声入力可）"
              style={{ paddingRight: 44 }}
            />
            <button
              className={`absolute top-2 right-2 flex items-center justify-center rounded-full ${
                isRecordingDesc ? 'bg-red-500 animate-pulse' : voiceTranscribing ? 'bg-blue-400' : 'bg-gray-400'
              }`}
              style={{ width: 32, height: 32 }}
              onClick={handleVoiceToggle}
              type="button"
              disabled={voiceTranscribing}
            >
              {voiceTranscribing ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-icons text-white text-sm">
                  {isRecordingDesc ? 'stop' : 'mic'}
                </span>
              )}
            </button>
          </div>
          {voiceStatus && (
            <p className={`text-[10px] mt-0.5 ${isRecordingDesc ? 'text-red-500 font-semibold' : voiceTranscribing ? 'text-blue-500 font-semibold' : 'text-gray-500'}`}>
              {voiceStatus}
            </p>
          )}
          <button
            className="btn-format mt-2"
            onClick={async () => {
              if (!form.workDesc.trim()) { showToast('整形する文章がありません', 'error'); return; }
              setFormatting(true);
              try {
                const result = await callFormatText(form.workDesc, 'admin_project_desc');
                update('workDesc', result);
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
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="form-field">
            <label>見込み金額（円）*</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value)}
              placeholder="1500000"
              inputMode="numeric"
            />
          </div>
          <div className="form-field">
            <label>問い合わせ日 *</label>
            <input
              type="date"
              value={form.inquiryDate}
              onChange={(e) => update('inquiryDate', e.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label>取得経路 *</label>
          <select value={form.route} onChange={(e) => update('route', e.target.value)}>
            <option value="">選択してください</option>
            {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* 担当者割り当て */}
      <div className="form-card" style={{ background: '#eff6ff' }}>
        <h3 className="section-title" style={{ color: '#2563eb' }}>
          <span className="material-icons" style={{ color: '#2563eb' }}>person_add</span>
          担当者割り当て
        </h3>

        <select
          value={form.assigned}
          onChange={(e) => update('assigned', e.target.value)}
          className="w-full"
        >
          <option value="">自分が担当</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}（{emp.role === 'admin' ? '管理者' : emp.role === 'sales' ? '営業' : emp.role}）
            </option>
          ))}
        </select>
        <p className="text-xs mt-2" style={{ color: '#3b82f6' }}>
          ※ 登録すると担当者にLINE通知が送信されます
        </p>
      </div>

      {/* 備考 */}
      <div className="form-card">
        <div className="form-field">
          <label>備考</label>
          <textarea
            rows={2}
            value={form.memo}
            onChange={(e) => update('memo', e.target.value)}
            placeholder="その他メモ"
          />
        </div>
      </div>

      <button className="btn-line-action mb-4" onClick={handleRegister} disabled={submitting}>
        <span className="material-icons text-base">send</span>
        案件を登録して通知する
      </button>
    </>
  );
}
