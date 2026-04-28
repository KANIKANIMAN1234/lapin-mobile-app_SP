'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import { Toast } from '@/components/ui/Toast';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/hooks/useToast';

// ── 型定義 ────────────────────────────────────────────────────
type NoticeCategory = 'general' | 'notice' | 'tip';

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
}

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

// ── メインページ ──────────────────────────────────────────────
export default function NoticePage() {
  const { user } = useAuthStore();
  const { toasts, showToast, removeToast } = useToast();
  const isAdmin = user?.role === 'admin';

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    title: '',
    body: '',
    category: 'general' as NoticeCategory,
    is_pinned: false,
  });

  // ── 一覧取得 ─────────────────────────────────────────────────
  const fetchNotices = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('t_notices')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setNotices((data ?? []) as Notice[]);
    } catch (e) {
      console.error('[NoticePage] fetch error:', e);
      showToast('読み込みに失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchNotices(); }, [fetchNotices]);

  // ── 投稿 ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.body.trim()) { showToast('本文を入力してください', 'error'); return; }
    setSubmitting(true);

    try {
      const supabase = createClient();
      const displayName = isAdmin ? '社長' : (user?.name ?? '不明');

      const { error: insertError } = await supabase.from('t_notices').insert({
        user_id: user?.id ?? null,
        user_name: displayName,
        user_role: user?.role ?? 'general',
        title: form.title.trim() || null,
        body: form.body.trim(),
        category: form.category,
        is_pinned: form.is_pinned,
      });
      if (insertError) throw insertError;

      // LINE一斉通知
      const catLabel = CATEGORY_LABELS[form.category];
      const lineMsg =
        `📢【${catLabel}】\n投稿者: ${displayName}\n` +
        (form.title.trim() ? `件名: ${form.title.trim()}\n` : '') +
        `---\n${form.body.trim()}`;

      fetch('/api/line-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: lineMsg }),
      }).catch((e) => console.error('[NoticePage] line-broadcast error:', e));

      setForm({ title: '', body: '', category: 'general', is_pinned: false });
      setShowForm(false);
      showToast('投稿し、LINEに通知しました', 'success');
      await fetchNotices();
    } catch (e) {
      console.error('[NoticePage] submit error:', e);
      showToast('投稿に失敗しました', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── ピン留めトグル ────────────────────────────────────────────
  const togglePin = async (notice: Notice) => {
    try {
      const supabase = createClient();
      await supabase
        .from('t_notices')
        .update({ is_pinned: !notice.is_pinned })
        .eq('id', notice.id);
      await fetchNotices();
    } catch (e) {
      console.error('[NoticePage] togglePin error:', e);
    }
  };

  // ── 削除 ──────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('この連絡事項を削除しますか？')) return;
    try {
      const supabase = createClient();
      await supabase.from('t_notices').delete().eq('id', id);
      showToast('削除しました', 'success');
      await fetchNotices();
    } catch (e) {
      console.error('[NoticePage] delete error:', e);
      showToast('削除に失敗しました', 'error');
    }
  };

  // ── レンダリング ──────────────────────────────────────────────
  return (
    <>
      <LoadingOverlay show={submitting} message="投稿中..." />
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* 投稿フォーム */}
      {showForm ? (
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
            <textarea
              rows={4}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="連絡内容を入力..."
              required
            />
          </div>

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
              onClick={() => { setShowForm(false); setForm({ title: '', body: '', category: 'general', is_pinned: false }); }}
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
        <button
          className="btn-line-action w-full mb-4"
          onClick={() => setShowForm(true)}
          style={{ background: '#f97316' }}
        >
          <span className="material-icons text-base">edit</span>
          新しい連絡を投稿する
        </button>
      )}

      {/* 一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
          <div className="w-5 h-5 rounded-full border-2 border-gray-200 border-t-orange-500 animate-spin" />
          読み込み中...
        </div>
      ) : notices.length === 0 ? (
        <div className="form-card text-center py-12">
          <span className="material-icons text-gray-300 text-5xl mb-3">forum</span>
          <p className="text-gray-400 text-sm">連絡事項はまだありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => {
            const colors = CATEGORY_COLORS[notice.category as NoticeCategory] ?? CATEGORY_COLORS.general;
            return (
              <div
                key={notice.id}
                className="form-card"
                style={notice.is_pinned ? { borderColor: '#f59e0b', background: '#fffbeb' } : {}}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {notice.is_pinned && (
                      <span className="material-icons text-amber-500 text-sm">push_pin</span>
                    )}
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: colors.bg, color: colors.text }}
                    >
                      {CATEGORY_LABELS[notice.category as NoticeCategory] ?? notice.category}
                    </span>
                    <span className="text-[10px] text-gray-400">{formatDate(notice.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => togglePin(notice)}
                      className={`p-1 rounded-full ${notice.is_pinned ? 'text-amber-500' : 'text-gray-300'}`}
                    >
                      <span className="material-icons text-base">push_pin</span>
                    </button>
                    <button
                      onClick={() => handleDelete(notice.id)}
                      className="p-1 rounded-full text-gray-300 hover:text-red-400"
                    >
                      <span className="material-icons text-base">delete</span>
                    </button>
                  </div>
                </div>

                <p className="text-xs font-semibold text-gray-500 mb-1">{notice.user_name}</p>
                {notice.title && (
                  <p className="font-bold text-gray-800 text-sm mb-1">{notice.title}</p>
                )}
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {notice.body}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
