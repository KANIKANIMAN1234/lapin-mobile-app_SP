'use client';

import { useState, useEffect, useCallback } from 'react';
import { Toast } from '@/components/ui/Toast';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';
import type { Attendance, AttendanceStatus, AttendanceType, AttendanceLog } from '@/types';

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

const LOG_CONFIG: Record<AttendanceType, { label: string; icon: string; color: string }> = {
  clock_in:    { label: '出勤',     icon: 'login',         color: 'text-line-green' },
  break_start: { label: '休憩開始', icon: 'free_breakfast', color: 'text-yellow-500' },
  break_end:   { label: '休憩終了', icon: 'replay',        color: 'text-blue-500'   },
  clock_out:   { label: '退勤',     icon: 'logout',        color: 'text-red-500'    },
};

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${DAYS[date.getDay()]}）`;
}

function todayDateStr(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

function calcWorkMinutes(
  clockIn: string,
  clockOut: string,
  breakStart?: string,
  breakEnd?: string
): number {
  const toMin = (t: string) => {
    const [h, m] = t.slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  };
  let work = toMin(clockOut) - toMin(clockIn);
  if (breakStart && breakEnd) {
    work -= toMin(breakEnd) - toMin(breakStart);
  }
  return Math.max(0, work);
}

function getLocation(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

function buildLocationUrl(loc: { latitude: number; longitude: number } | null): string | null {
  if (!loc) return null;
  return `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
}

function deriveStatus(att: Attendance | null): AttendanceStatus {
  if (!att) return 'none';
  if (att.clock_out) return 'left';
  if (att.break_start && !att.break_end) return 'break';
  if (att.clock_in) return 'working';
  return 'none';
}

function deriveLogs(att: Attendance): AttendanceLog[] {
  const logs: AttendanceLog[] = [];
  if (att.clock_in)    logs.push({ time: att.clock_in.slice(0, 5),    type: 'clock_in',    label: '出勤' });
  if (att.break_start) logs.push({ time: att.break_start.slice(0, 5), type: 'break_start', label: '休憩開始' });
  if (att.break_end)   logs.push({ time: att.break_end.slice(0, 5),   type: 'break_end',   label: '休憩終了' });
  if (att.clock_out)   logs.push({ time: att.clock_out.slice(0, 5),   type: 'clock_out',   label: '退勤' });
  return logs.reverse();
}

export default function AttendancePage() {
  const { toasts, showToast, removeToast } = useToast();
  const { user } = useAuthStore();
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);

  const status = deriveStatus(attendance);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchToday = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const today = todayDateStr();
    const { data, error } = await supabase
      .from('t_attendance')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();
    if (error) console.error('[Attendance] fetch error:', error);
    setAttendance(data ?? null);
    setLogs(data ? deriveLogs(data) : []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  const punch = async (type: AttendanceType) => {
    if (!user) { showToast('ユーザー情報がありません', 'error'); return; }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const today = todayDateStr();
      const time = formatTime(new Date());

      let locationUrl: string | null = null;
      if (type === 'clock_in' || type === 'clock_out') {
        const loc = await getLocation();
        locationUrl = buildLocationUrl(loc);
      }

      const updates: Record<string, unknown> = {
        user_id: user.id,
        date: today,
        updated_at: new Date().toISOString(),
        [type]: time,
      };
      if (type === 'clock_in' && locationUrl) updates['clock_in_location'] = locationUrl;
      if (type === 'clock_out' && locationUrl) updates['clock_out_location'] = locationUrl;
      if (type === 'clock_out' && attendance?.clock_in) {
        updates['total_work_minutes'] = calcWorkMinutes(
          attendance.clock_in,
          time,
          attendance.break_start ?? undefined,
          attendance.break_end ?? undefined
        );
      }

      let result;
      if (!attendance) {
        result = await supabase.from('t_attendance').insert(updates).select().single();
      } else {
        result = await supabase.from('t_attendance').update(updates).eq('id', attendance.id).select().single();
      }

      if (result.error) throw result.error;

      showToast(`${LOG_CONFIG[type].label}を記録しました (${time})`, 'success');
      setAttendance(result.data);
      setLogs(deriveLogs(result.data));
    } catch (e) {
      console.error('[Attendance] punch error:', e);
      showToast('記録に失敗しました', 'error');
    }
    setSubmitting(false);
  };

  const statusText = (() => {
    if (!attendance || status === 'none') return '未打刻';
    if (status === 'left')    return `退勤済み (${attendance.clock_in?.slice(0, 5)}〜${attendance.clock_out?.slice(0, 5)})`;
    if (status === 'break')   return `休憩中 (${attendance.break_start?.slice(0, 5)}〜)`;
    if (status === 'working') return `出勤中 (${attendance.clock_in?.slice(0, 5)}〜)`;
    return '未打刻';
  })();

  const statusColor = {
    none:    'bg-gray-100 text-gray-600',
    working: 'bg-green-100 text-green-700',
    break:   'bg-yellow-100 text-yellow-700',
    left:    'bg-gray-200 text-gray-600',
  }[status];

  if (loading) {
    return (
      <div className="form-card text-center py-12">
        <div className="spinner" style={{ margin: '0 auto' }} />
        <p className="text-gray-400 text-sm mt-3">読み込み中...</p>
      </div>
    );
  }

  return (
    <>
      <Toast toasts={toasts} onRemove={removeToast} />

      <div className="form-card text-center">
        <p className="text-gray-500 text-sm mb-1">{formatDate(now)}</p>

        {/* リアルタイム時計 */}
        <p
          className="font-extrabold text-gray-900 my-4 tracking-widest"
          style={{ fontSize: '2.8rem', fontVariantNumeric: 'tabular-nums', letterSpacing: '2px' }}
        >
          {now.toTimeString().slice(0, 8)}
        </p>

        {/* ステータスバッジ */}
        <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-6 ${statusColor}`}>
          {statusText}
        </div>

        {/* 4ボタン（2×2グリッド） */}
        <div className="grid grid-cols-2 gap-4 px-4 mb-4">
          <div className="flex flex-col items-center gap-2">
            <button
              className="attendance-btn btn-clockin"
              onClick={() => punch('clock_in')}
              disabled={submitting || status !== 'none'}
            >
              <span className="material-icons" style={{ fontSize: 36 }}>login</span>
              <span className="text-sm font-bold mt-1">出勤</span>
            </button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              className="attendance-btn btn-break"
              onClick={() => punch('break_start')}
              disabled={submitting || status !== 'working'}
            >
              <span className="material-icons" style={{ fontSize: 36 }}>free_breakfast</span>
              <span className="text-sm font-bold mt-1">休憩</span>
            </button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              className="attendance-btn btn-return"
              onClick={() => punch('break_end')}
              disabled={submitting || status !== 'break'}
            >
              <span className="material-icons" style={{ fontSize: 36 }}>replay</span>
              <span className="text-sm font-bold mt-1">戻り</span>
            </button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              className="attendance-btn btn-clockout"
              onClick={() => punch('clock_out')}
              disabled={submitting || (status !== 'working' && status !== 'break')}
            >
              <span className="material-icons" style={{ fontSize: 36 }}>logout</span>
              <span className="text-sm font-bold mt-1">退勤</span>
            </button>
          </div>
        </div>

        {/* 実労働時間（退勤済みのみ表示） */}
        {status === 'left' && attendance?.total_work_minutes != null && (
          <p className="text-sm text-gray-500">
            実労働時間:{' '}
            <span className="font-bold text-gray-700">
              {Math.floor(attendance.total_work_minutes / 60)}時間
              {attendance.total_work_minutes % 60}分
            </span>
          </p>
        )}
      </div>

      {/* 打刻履歴 */}
      {logs.length > 0 && (
        <div className="form-card">
          <h3 className="section-title">
            <span className="material-icons text-line-green">history</span>
            本日の打刻履歴
          </h3>
          <div className="flex flex-col gap-2">
            {logs.map((log, i) => {
              const cfg = LOG_CONFIG[log.type];
              return (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className={`material-icons text-base ${cfg.color}`}>{cfg.icon}</span>
                  <span className="text-sm font-bold text-gray-800">{log.time}</span>
                  <span className="text-sm text-gray-500">{log.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
