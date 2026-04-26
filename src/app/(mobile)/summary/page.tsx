'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useExpenses } from '@/hooks/useExpenses';
import { useProjects } from '@/hooks/useProjects';

const CHART_COLORS = ['#06C755', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#10b981'];

export default function SummaryPage() {
  const { data: expenses = [] } = useExpenses();
  const { data: projects = [] } = useProjects();

  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterProject, setFilterProject] = useState('');

  const categoryChartRef = useRef<HTMLCanvasElement>(null);
  const projectChartRef = useRef<HTMLCanvasElement>(null);
  const categoryChartInstance = useRef<unknown>(null);
  const projectChartInstance = useRef<unknown>(null);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (filterProject && e.project_id !== filterProject) return false;
      if (filterYear && !e.expense_date.startsWith(filterYear)) return false;
      if (filterMonth && e.expense_date.split('-')[1] !== filterMonth.padStart(2, '0')) return false;
      return true;
    });
  }, [expenses, filterProject, filterYear, filterMonth]);

  const total = filtered.reduce((sum, e) => sum + e.amount, 0);

  // カテゴリ別集計
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e) => {
      map[e.category] = (map[e.category] ?? 0) + e.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  // 案件別集計
  const projectData = useMemo(() => {
    const map: Record<string, { name: string; amount: number }> = {};
    filtered.forEach((e) => {
      if (!e.project_id) return;
      if (!map[e.project_id]) {
        map[e.project_id] = {
          name: `${e.project_number ?? ''} ${e.customer_name ?? ''}`.trim(),
          amount: 0,
        };
      }
      map[e.project_id].amount += e.amount;
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  // 案件別原価率
  const costRatioData = useMemo(() => {
    return projects
      .filter((p) => p.contract_amount)
      .map((p) => {
        const cost = filtered
          .filter((e) => e.project_id === p.id)
          .reduce((s, e) => s + e.amount, 0);
        const contract = p.contract_amount ?? 1;
        const planned = p.planned_budget ? (p.planned_budget / contract) * 100 : 60;
        const actual = (cost / contract) * 100;
        const estimated = p.actual_cost ? ((p.actual_cost) / contract) * 100 : actual * 1.3;

        return {
          project_number: p.project_number,
          customer_name: p.customer_name,
          contract_amount: contract,
          planned_budget_ratio: planned,
          actual_cost_ratio: actual,
          estimated_cost_ratio: estimated,
        };
      });
  }, [projects, filtered]);

  const getRatioClass = (actual: number, planned: number) => {
    if (actual >= planned) return 'text-red-600 font-bold';
    if (actual >= planned * 0.8) return 'text-yellow-600 font-bold';
    return 'text-green-600 font-bold';
  };

  // Chart.js グラフ描画
  useEffect(() => {
    let Chart: typeof import('chart.js').Chart | null = null;

    async function drawCharts() {
      const { Chart: ChartJs, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } = await import('chart.js');
      ChartJs.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
      Chart = ChartJs;

      // カテゴリドーナツ
      if (categoryChartRef.current && categoryData.length > 0) {
        if (categoryChartInstance.current) {
          (categoryChartInstance.current as { destroy(): void }).destroy();
        }
        categoryChartInstance.current = new ChartJs(categoryChartRef.current, {
          type: 'doughnut',
          data: {
            labels: categoryData.map(([k]) => k),
            datasets: [{
              data: categoryData.map(([, v]) => v),
              backgroundColor: CHART_COLORS,
            }],
          },
          options: {
            cutout: '60%',
            plugins: {
              legend: { position: 'bottom' },
              tooltip: {
                callbacks: {
                  label: (ctx) => `¥${(ctx.raw as number).toLocaleString()} (${Math.round((ctx.raw as number) / total * 100)}%)`,
                },
              },
            },
          },
        });
      }

      // 案件別横棒
      if (projectChartRef.current && projectData.length > 0) {
        if (projectChartInstance.current) {
          (projectChartInstance.current as { destroy(): void }).destroy();
        }
        projectChartInstance.current = new ChartJs(projectChartRef.current, {
          type: 'bar',
          data: {
            labels: projectData.map((p) => p.name),
            datasets: [{
              data: projectData.map((p) => p.amount),
              backgroundColor: '#06C755',
            }],
          },
          options: {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
              x: {
                ticks: {
                  callback: (v) => `¥${Math.round(Number(v) / 1000)}K`,
                },
              },
            },
          },
        });
      }
    }

    drawCharts();

    return () => {
      if (categoryChartInstance.current) {
        (categoryChartInstance.current as { destroy(): void }).destroy();
      }
      if (projectChartInstance.current) {
        (projectChartInstance.current as { destroy(): void }).destroy();
      }
    };
  }, [categoryData, projectData, total]);

  return (
    <div>
      {/* フィルター */}
      <div className="bg-gray-100 rounded-xl p-3 mb-4">
        <div className="grid grid-cols-3 gap-2">
          <select
            className="px-2 py-2 rounded-lg border border-gray-200 bg-white text-xs"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
          >
            <option value="">年</option>
            {['2024', '2025', '2026', '2027'].map((y) => <option key={y} value={y}>{y}年</option>)}
          </select>
          <select
            className="px-2 py-2 rounded-lg border border-gray-200 bg-white text-xs"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          >
            <option value="">月</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={String(m)}>{m}月</option>
            ))}
          </select>
          <select
            className="px-2 py-2 rounded-lg border border-gray-200 bg-white text-xs"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="">全案件</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_number}</option>
            ))}
          </select>
        </div>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-xs text-gray-500 mb-1">経費合計</p>
          <p className="font-bold text-[1.2rem] text-gray-900">¥{total.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-xs text-gray-500 mb-1">登録件数</p>
          <p className="font-bold text-[1.2rem] text-gray-900">{filtered.length}件</p>
        </div>
      </div>

      {/* 案件別原価率テーブル */}
      {costRatioData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm mb-4 overflow-hidden">
          <h3 className="font-bold text-sm text-gray-800 p-3 border-b border-gray-100">
            案件別原価率
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-600 font-semibold">案件</th>
                  <th className="px-2 py-2 text-right text-gray-600 font-semibold">予定</th>
                  <th className="px-2 py-2 text-right text-gray-600 font-semibold">実質</th>
                  <th className="px-2 py-2 text-right text-gray-600 font-semibold">想定</th>
                </tr>
              </thead>
              <tbody>
                {costRatioData.map((row) => (
                  <tr key={row.project_number} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-700">
                      <p className="font-medium">{row.project_number}</p>
                      <p className="text-[0.6rem] text-gray-400 truncate">{row.customer_name}</p>
                    </td>
                    <td className="px-2 py-2 text-right text-gray-600">
                      {row.planned_budget_ratio.toFixed(1)}%
                    </td>
                    <td className={`px-2 py-2 text-right ${getRatioClass(row.actual_cost_ratio, row.planned_budget_ratio)}`}>
                      {row.actual_cost_ratio.toFixed(1)}%
                    </td>
                    <td className={`px-2 py-2 text-right ${getRatioClass(row.estimated_cost_ratio, row.planned_budget_ratio)}`}>
                      {row.estimated_cost_ratio.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* カテゴリ別チャート */}
      {categoryData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <h3 className="font-bold text-sm text-gray-800 mb-3">カテゴリ別内訳</h3>
          <canvas ref={categoryChartRef} />
        </div>
      )}

      {/* 案件別チャート */}
      {projectData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <h3 className="font-bold text-sm text-gray-800 mb-3">案件別経費</h3>
          <div style={{ height: 220 }}>
            <canvas ref={projectChartRef} />
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <span className="material-icons text-4xl mb-2">pie_chart</span>
          <p className="text-sm">データがありません</p>
        </div>
      )}
    </div>
  );
}
