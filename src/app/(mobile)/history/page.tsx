'use client';

import { useState, useMemo } from 'react';
import { useExpenses } from '@/hooks/useExpenses';
import { useProjects } from '@/hooks/useProjects';

const CATEGORIES = ['材料費', '交通費', '外注費', '消耗品費', '飲食費', 'その他'];
const YEARS = ['2024', '2025', '2026', '2027'];
const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export default function HistoryPage() {
  const { data: expenses = [] } = useExpenses();
  const { data: projects = [] } = useProjects();

  const [filterProject, setFilterProject] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (filterProject && e.project_id !== filterProject) return false;
      if (filterCategory && e.category !== filterCategory) return false;
      if (filterYear && !e.expense_date.startsWith(filterYear)) return false;
      if (filterMonth && e.expense_date.split('-')[1] !== filterMonth.padStart(2, '0')) return false;
      return true;
    });
  }, [expenses, filterProject, filterCategory, filterYear, filterMonth]);

  const total = filtered.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      {/* フィルター */}
      <div className="bg-gray-100 rounded-xl p-3 mb-4">
        <div className="grid grid-cols-2 gap-2">
          <select
            className="px-2 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="">全案件</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_number} {p.customer_name}
              </option>
            ))}
          </select>

          <select
            className="px-2 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">全分類</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            className="px-2 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
          >
            <option value="">年</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}年</option>)}
          </select>

          <select
            className="px-2 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          >
            <option value="">月</option>
            {MONTHS.map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
      </div>

      {/* 合計 */}
      <div className="text-center mb-4">
        <p
          className="font-bold text-[1.1rem] inline-block pb-1"
          style={{ borderBottom: '2px solid var(--line-green)' }}
        >
          合計: ¥{total.toLocaleString()}
        </p>
        <p className="text-xs text-gray-400 mt-1">{filtered.length}件</p>
      </div>

      {/* リスト */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <span className="material-icons text-4xl mb-2">receipt_long</span>
            <p className="text-sm">経費データがありません</p>
          </div>
        ) : (
          filtered.map((expense) => (
            <div key={expense.id} className="bg-white rounded-xl shadow-sm p-3 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 truncate">
                  {expense.memo || expense.category}
                </p>
                {expense.project_number && (
                  <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--blue)' }}>
                    {expense.project_number} {expense.customer_name}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {expense.category} · {expense.expense_date} · {expense.user_name}
                </p>
              </div>
              <div className="flex flex-col items-end shrink-0 ml-2">
                <p className="font-bold text-base" style={{ color: 'var(--red)' }}>
                  ¥{expense.amount.toLocaleString()}
                </p>
                {expense.receipt_image_url && (
                  <button
                    className="text-xs text-blue-500 flex items-center gap-0.5 mt-1"
                    onClick={() => window.open(expense.receipt_image_url, '_blank')}
                  >
                    <span className="material-icons text-xs">image</span>
                    領収書
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
