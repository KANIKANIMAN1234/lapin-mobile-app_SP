'use client';

import { useState, useEffect } from 'react';
import { Toast } from '@/components/ui/Toast';
import { useToast } from '@/hooks/useToast';
import type { AttendanceLog } from '@/types';

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${DAYS[date.getDay()]}）`;
}

export default function AttendancePage() {
  const { toasts, showToast, removeToast } = useToast();
  const [now, setNow] = useState(new Date());
  const [clockedIn, setClockedIn] = useState(false);
  const [clockedOut, setClockedOut] = useState(false);
  const [clockInTime, setClockInTime] = useState('');
  const [clockOutTime, setClockOutTime] = useState('');
  const [logs, setLogs] = useState<AttendanceLog[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleClockIn = () => {
    const time = formatTime(new Date());
    setClockInTime(time);
    setClockedIn(true);
    setLogs((prev) => [{ time, type: 'clock_in', label: '出勤' }, ...prev]);
    showToast(`出勤打刻しました (${time})`, 'success');
  };

  const handleClockOut = () => {
    const time = formatTime(new Date());
    setClockOutTime(time);
    setClockedOut(true);
    setClockedIn(false);
    setLogs((prev) => [{ time, type: 'clock_out', label: '退勤' }, ...prev]);
    showToast(`退勤打刻しました (${time})`, 'success');
  };

  const statusText = clockedOut
    ? `退勤済み (${clockInTime}〜${clockOutTime})`
    : clockedIn
    ? `出勤中 (${clockInTime}〜)`
    : '未打刻';

  const timeString = now.toTimeString().slice(0, 8);

  return (
    <>
      <Toast toasts={toasts} onRemove={removeToast} />

      <div className="form-card text-center">
        <p className="text-gray-500 text-sm mb-1">{formatDate(now)}</p>

        {/* リアルタイム時計 */}
        <p
          className="font-extrabold text-gray-900 my-4 tracking-widest"
          style={{
            fontSize: '2.8rem',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '2px',
          }}
        >
          {timeString}
        </p>

        {/* ステータス */}
        <div className="inline-block px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-sm font-medium mb-6">
          {statusText}
        </div>

        {/* 出退勤ボタン */}
        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <button
              className="attendance-btn btn-clockin"
              onClick={handleClockIn}
              disabled={clockedIn || clockedOut}
            >
              <span className="material-icons" style={{ fontSize: 36 }}>login</span>
              <span className="text-sm font-bold mt-1">出勤</span>
            </button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              className="attendance-btn btn-clockout"
              onClick={handleClockOut}
              disabled={!clockedIn || clockedOut}
            >
              <span className="material-icons" style={{ fontSize: 36 }}>logout</span>
              <span className="text-sm font-bold mt-1">退勤</span>
            </button>
          </div>
        </div>
      </div>

      {/* 打刻履歴 */}
      {logs.length > 0 && (
        <div className="form-card">
          <h3 className="section-title">
            <span className="material-icons text-line-green">history</span>
            本日の打刻履歴
          </h3>
          <div className="flex flex-col gap-2">
            {logs.map((log, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <span
                  className={`material-icons text-base ${
                    log.type === 'clock_in' ? 'text-line-green' : 'text-red-500'
                  }`}
                >
                  {log.type === 'clock_in' ? 'login' : 'logout'}
                </span>
                <span className="text-sm font-bold text-gray-800">{log.time}</span>
                <span className="text-sm text-gray-500">{log.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
