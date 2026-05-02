'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import { Toast } from '@/components/ui/Toast';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/hooks/useToast';
import { useVoiceInput } from '@/hooks/useVoiceInput';

async function callFormatText(text: string): Promise<string> {
  const res = await fetch('/api/format-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input_text: text, prompt_key: 'notice' }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err?.error ?? `AI整形APIエラー (${res.status})`);
  }
  const json = (await res.json()) as { success: boolean; error?: string; data?: { formatted_text?: string } };
  if (!json.success) throw new Error(json.error ?? 'AI整形に失敗しました');
  return json.data?.formatted_text ?? text;
}

type NoticeCategory = 'general' | 'notice' | 'tip';
type NotifyTarget = 'all' | 'individual' | 'office' | 'sales';

interface Notice {
  id: string;
  user_id: string | null;
  user_name: string;
  user_role: string;
  title: string | null;
  body: string;
  category: NoticeCategory;
  is_pinned: boolean;
  created_at: string;
  notify_target?: NotifyTarget | null;
  notify_user_id?: string | null;
  notify_user_name?: string | null;
}

interface EmployeeRow {
  id: string;
  name: string;
  role: string;
}

const DEMO_EMPLOYEES: EmployeeRow[] = [
  { id: 'demo-user-001', name: '山田太郎', role: 'sales' },
  { id: 'demo-user-002', name: '佐藤次郎', role: 'sales' },
  { id: 'demo-user-003', name: '鈴木三郎', role: 'sales' },
];

const CATEGORY_LABELS: Record<NoticeCategory, string> = {
  general: '連絡事項',
  notice: 'お知らせ',
  tip: '今日のお気づき',
};

const CATEGORY_COLORS: Record<NoticeCategory, { bg: string; text: string }> = {
  general: { bg: '#dbeafe', text: '#1d4ed8' },
  notice: { bg: '#fef3c7', text: '#92400e' },
  tip: { bg: '#dcfce7', text: '#166534' },
};

const NOTIFY_LABELS: Record<NotifyTarget, string> = {
  all: '全員向け',
  individual: '個別向け',
  office: '事務員向け',
  sales: '営業向け',
};

function noticeVisibleToUser(n: Notice, viewer: { id: string; role: string } | null): boolean {
  if (!viewer) return false;
  const tgt = (n.notify_target ?? 'all') as NotifyTarget;
  if (viewer.role === 'admin') return true;
  if (tgt === 'all') return true;
  if (tgt === 'office') return viewer.role === 'staff' || viewer.role === 'admin';
  if (tgt === 'sales') return viewer.role === 'sales';
  if (tgt === 'individual') return n.notify_user_id === viewer.id;
  return true;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}時間前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}日前`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

const EMPTY_FORM = {
  title: '',
  body: '',
  category: 'general' as NoticeCategory,
  is_pinned: false,
  notify_target: 'all' as NotifyTarget,
  notify_user_id: '',
};

export default function NoticePage() {
  const { user } = useAuthStore();
  const { toasts, showToast, removeToast } = useToast();
  const isAdmin = user?.role === 'admin';

  const [notices, setNotices] = useState<Notice[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formatting, setFormatting] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { isRecording, voiceStatus, toggleVoice, transcribing } = useVoiceInput({
    currentText: form.body,
    onTextUpdate: (text) => setForm((f) => ({ ...f, body: text })),
    onError: (msg) => showToast(msg, 'error'),
  });

  useEffect(() => {
    async function fetchEmployees() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('m_users')
          .select('id, name, role')
          .eq('status', 'active')
          .order('name');
        if (!error && data && data.length > 0) {
          setEmployees(data as EmployeeRow[]);
        } else {
          setEmployees(DEMO_EMPLOYEES);
        }
      } catch {
        setEmployees(DEMO_EMPLOYEES);
      }
    }
    fetchEmployees();
  }, []);

  const filteredNotices = useMemo(() => {
    if (!user) return [];
    return notices.filter((n) => noticeVisibleToUser(n, { id: user.id, role: user.role }));
  }, [notices, user]);

  const handleFormat = async () => {
    if (!form.body.trim()) {
      showToast('整形する文章がありません', 'error');
      return;
    }
    setFormatting(true);
    try {
      const result = await callFormatText(form.body);
      setForm((f) => ({ ...f, body: result }));
      showToast('AI整形しました', 'success');
    } catch (e) {
      console.error('[NoticePage] handleFormat error:', e);
      const msg = e instanceof Error ? e.message : 'AI整形に失敗しました';
      showToast(msg, 'error');
    } finally {
      setFormatting(false);
    }
  };

  const fetchNotices = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_notices')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setNotices((data ?? []) as Notice[]);
    } catch (e) {
      console.error('[NoticePage] fetch error:', e);
      showToast('読み込みに失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  const resetForm = () => setForm({ ...EMPTY_FORM });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!form.body.trim()) {
      showToast('本文を入力してください', 'error');
      return;
    }
    if (form.notify_target === 'individual' && !form.notify_user_id) {
      showToast('個別向けの宛先ユーザーを選択してください', 'error');
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const displayName = isAdmin ? '社長' : (user?.name ?? '不明');
      const targetName =
        form.notify_target === 'individual'
          ? employees.find((e) => e.id === form.notify_user_id)?.name ?? null
          : null;

      const insertRow: Record<string, unknown> = {
        user_id: user?.id ?? null,
        user_name: displayName,
        user_role: user?.role ?? 'general',
        title: form.title.trim() || null,
        body: form.body.trim(),
        category: form.category,
        is_pinned: form.is_pinned,
        notify_target: form.notify_target,
      };

      if (form.notify_target === 'individual') {
        insertRow.notify_user_id = form.notify_user_id;
        insertRow.notify_user_name = targetName;
      } else {
        insertRow.notify_user_id = null;
        insertRow.notify_user_name = null;
      }

      const { error: insertError } = await supabase.from('t_notices').insert(insertRow as never);
      if (insertError) {
        console.error('[NoticePage] insertError', insertError);
        if (insertError.message?.includes('notify_target') || insertError.code === 'PGRST204') {
          showToast(
            'データベースに通知先カラムがありません。PC/supabase/sql/12_add_notice_notify_target.sql を実行してください',
            'error',
          );
        } else {
          showToast('投稿に失敗しました', 'error');
        }
        return;
      }

      const catLabel = CATEGORY_LABELS[form.category];
      const scopeLabel = NOTIFY_LABELS[form.notify_target];
      const targetLine =
        form.notify_target === 'individual' && targetName ? `\n宛先（個別）: ${targetName}\n` : '\n';

      const lineMsg =
        `📢【${catLabel}｜${scopeLabel}】\n投稿者: ${displayName}` +
        targetLine +
        (form.title.trim() ? `件名: ${form.title.trim()}\n` : '') +
        `---\n${form.body.trim()}`;

      try {
        const broadcastRes = await fetch('/api/line-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: lineMsg,
            notifyTarget: form.notify_target,
            notifyUserId: form.notify_target === 'individual' ? form.notify_user_id : undefined,
          }),
        });
        const broadcastJson = (await broadcastRes.json()) as { success?: boolean; error?: string; sent?: number };
        if (!broadcastRes.ok || !broadcastJson.success) {
          showToast(`投稿しました（LINE通知失敗: ${broadcastJson.error ?? broadcastRes.status}）`, 'error');
        } else {
          showToast(`投稿し、LINE通知しました（${broadcastJson.sent ?? 0}件）`, 'success');
        }
      } catch (broadcastErr) {
        console.error('[NoticePage] line-broadcast fetch error:', broadcastErr);
        showToast('投稿しました（LINE通知に失敗しました）', 'error');
      }

      resetForm();
      setShowForm(false);
      await fetchNotices();
    } catch (e) {
      console.error('[NoticePage] submit error:', e);
      showToast('投稿に失敗しました', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePin = async (notice: Notice) => {
    if (!isAdmin) return;
    try {
      const supabase = createClient();
      await supabase
        .from('t_notices')
        .update({ is_pinned: !notice.is_pinned })
        .eq('id', notice.id);
      await fetchNotices();
    } catch (err) {
      console.error('[NoticePage] togglePin error:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm('この連絡事項を削除しますか？')) return;
    try {
      const supabase = createClient();
      await supabase.from('t_notices').delete().eq('id', id);
      showToast('削除しました', 'success');
      await fetchNotices();
    } catch (err) {
      console.error('[NoticePage] delete error:', err);
      showToast('削除に失敗しました', 'error');
    }
  };

  const notifyTargetSubLabel = (n: Notice): string => {
    const tgt = (n.notify_target ?? 'all') as NotifyTarget;
    if (tgt === 'individual' && n.notify_user_name) {
      return `個別: ${n.notify_user_name}`;
    }
    return NOTIFY_LABELS[tgt] ?? NOTIFY_LABELS.all;
  };

  return (
    <>
      <LoadingOverlay show={submitting} message="投稿中..." />
      <Toast toasts={toasts} onRemove={removeToast} />

      {!isAdmin && (
        <p className="text-xs text-gray-500 mb-3 px-1">
          あなたが閲覧できるお知らせのみ表示しています（全員向け・役職向け・個別宛てなど）。
        </p>
      )}

      {isAdmin && showForm ? (
        <form onSubmit={handleSubmit} className="form-card mb-3">
          <h3 className="section-title">
            <span className="material-icons text-orange-500">edit_note</span>
            新規投稿
          </h3>

          <div className="form-field">
            <label>カテゴリ</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as NoticeCategory }))}
            >
              <option value="general">連絡事項</option>
              <option value="notice">お知らせ</option>
              <option value="tip">今日のお気づき</option>
            </select>
          </div>

          <div className="form-field">
            <label>通知先 *</label>
            <select
              value={form.notify_target}
              onChange={(e) => {
                const v = e.target.value as NotifyTarget;
                setForm((f) => ({
                  ...f,
                  notify_target: v,
                  notify_user_id: v === 'individual' ? f.notify_user_id : '',
                }));
              }}
            >
              <option value="all">{NOTIFY_LABELS.all}</option>
              <option value="individual">{NOTIFY_LABELS.individual}</option>
              <option value="office">{NOTIFY_LABELS.office}</option>
              <option value="sales">{NOTIFY_LABELS.sales}</option>
            </select>
            <p className="text-[0.65rem] text-gray-500 mt-1">
              事務員向け＝管理者・事務（admin / staff）。営業向け＝営業（sales）のみ。
            </p>
          </div>

          {form.notify_target === 'individual' && (
            <div className="form-field">
              <label>宛先ユーザー *</label>
              <select
                required
                value={form.notify_user_id}
                onChange={(e) => setForm((f) => ({ ...f, notify_user_id: e.target.value }))}
              >
                <option value="">選択してください</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}（{emp.role === 'admin' ? '管理者' : emp.role === 'staff' ? '事務' : '営業'}）
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-field">
            <label>件名（省略可）</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="件名を入力"
            />
          </div>

          <div className="form-field">
            <label>本文 *</label>
            <div className="relative">
              <textarea
                rows={4}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="連絡内容を入力..."
                required
                className="w-full pr-12"
              />
              <button
                type="button"
                onClick={toggleVoice}
                disabled={transcribing}
                className={`absolute right-2 top-2 p-2 rounded-full transition-colors ${
                  isRecording
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                }`}
              >
                {transcribing ? (
                  <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="material-icons text-base">mic</span>
                )}
              </button>
            </div>
            {(isRecording || transcribing || voiceStatus) && (
              <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">
                {isRecording && (
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block" />
                )}
                {voiceStatus || (isRecording ? '録音中...' : '')}
              </p>
            )}
          </div>

          <button className="btn-format mb-3" onClick={handleFormat} type="button" disabled={formatting}>
            <span className="material-icons text-base text-purple-500">auto_fix_high</span>
            {formatting ? 'AI整形中...' : 'AI整形'}
          </button>

          <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_pinned}
              onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.checked }))}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700 flex items-center gap-1">
              <span className="material-icons text-amber-500 text-base">push_pin</span>
              ピン留めする
            </span>
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              className="flex-1 py-3 rounded-xl font-bold border border-gray-200 text-gray-700 text-sm"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              キャンセル
            </button>
            <button type="submit" className="btn-line-action flex-1" disabled={submitting}>
              <span className="material-icons text-base">send</span>
              投稿 &amp; LINE通知
            </button>
          </div>
        </form>
      ) : (
        isAdmin && (
          <button
            className="btn-line-action w-full mb-4"
            onClick={() => setShowForm(true)}
            style={{ background: '#f97316' }}
          >
            <span className="material-icons text-base">edit</span>
            新しい連絡を投稿する
          </button>
        )
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
          <div className="w-5 h-5 rounded-full border-2 border-gray-200 border-t-orange-500 animate-spin" />
          読み込み中...
        </div>
      ) : filteredNotices.length === 0 ? (
        <div className="form-card text-center py-12">
          <span className="material-icons text-gray-300 text-5xl mb-3">forum</span>
          <p className="text-gray-400 text-sm">表示できる連絡事項はまだありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotices.map((notice) => {
            const colors = CATEGORY_COLORS[notice.category as NoticeCategory] ?? CATEGORY_COLORS.general;
            return (
              <div
                key={notice.id}
                className="form-card"
                style={notice.is_pinned ? { borderColor: '#f59e0b', background: '#fffbeb' } : {}}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {notice.is_pinned && <span className="material-icons text-amber-500 text-sm">push_pin</span>}
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: colors.bg, color: colors.text }}
                    >
                      {CATEGORY_LABELS[notice.category as NoticeCategory] ?? notice.category}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600"
                      title="通知先"
                    >
                      {notifyTargetSubLabel(notice)}
                    </span>
                    <span className="text-[10px] text-gray-400">{formatDate(notice.created_at)}</span>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => togglePin(notice)}
                        className={`p-1 rounded-full ${notice.is_pinned ? 'text-amber-500' : 'text-gray-300'}`}
                      >
                        <span className="material-icons text-base">push_pin</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(notice.id)}
                        className="p-1 rounded-full text-gray-300 hover:text-red-400"
                      >
                        <span className="material-icons text-base">delete</span>
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-xs font-semibold text-gray-500 mb-1">{notice.user_name}</p>
                {notice.title && <p className="font-bold text-gray-800 text-sm mb-1">{notice.title}</p>}
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{notice.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
