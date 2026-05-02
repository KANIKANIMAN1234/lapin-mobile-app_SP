'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import type { Expense } from '@/types';

const DEMO_EXPENSES: Expense[] = [
  {
    id: '1',
    project_id: '1',
    project_number: '2026-001',
    customer_name: '田中一郎',
    amount: 12500,
    expense_date: '2026-04-25',
    category: '材料費',
    memo: 'ペンキ・刷毛',
    user_id: 'demo-user-001',
    user_name: '山田太郎',
    created_at: '2026-04-25T10:00:00Z',
  },
  {
    id: '2',
    project_id: '2',
    project_number: '2026-002',
    customer_name: '鈴木花子',
    amount: 3200,
    expense_date: '2026-04-24',
    category: '交通費',
    memo: '現場往復交通費',
    user_id: 'demo-user-001',
    user_name: '山田太郎',
    created_at: '2026-04-24T15:00:00Z',
  },
  {
    id: '3',
    amount: 8800,
    expense_date: '2026-04-22',
    category: '接待交際費',
    memo: '打ち合わせ昼食代',
    user_id: 'demo-user-001',
    user_name: '山田太郎',
    created_at: '2026-04-22T12:30:00Z',
  },
  {
    id: '4',
    project_id: '1',
    project_number: '2026-001',
    customer_name: '田中一郎',
    amount: 45000,
    expense_date: '2026-04-20',
    category: '外注費',
    memo: '足場設置費用',
    user_id: 'demo-user-001',
    user_name: '山田太郎',
    created_at: '2026-04-20T09:00:00Z',
  },
  {
    id: '5',
    amount: 2100,
    expense_date: '2026-04-18',
    category: '消耗品費',
    memo: '事務用品',
    user_id: 'demo-user-001',
    user_name: '山田太郎',
    created_at: '2026-04-18T14:00:00Z',
  },
];

/** Supabase の JOIN 行を Expense 型に整形（PC版 expense ページと同等） */
function mapExpenseRows(rows: unknown): Expense[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const e = raw as Record<string, unknown> & {
      t_projects?: { project_number?: string; customer_name?: string } | null;
      expense_user?: { name?: string } | null;
    };
    const proj = e.t_projects;
    const u = e.expense_user;
    return {
      id: String(e.id),
      user_id: String(e.user_id),
      project_id: e.project_id ? String(e.project_id) : undefined,
      project_number: proj?.project_number,
      customer_name: proj?.customer_name,
      amount: Number(e.amount),
      expense_date: String(e.expense_date),
      category: String(e.category),
      memo: e.memo != null ? String(e.memo) : undefined,
      receipt_image_url:
        e.receipt_image_url != null ? String(e.receipt_image_url) : undefined,
      status: e.status as Expense['status'],
      user_name: u?.name,
      created_at: String(e.created_at ?? ''),
    };
  });
}

export function useExpenses(userId?: string) {
  const supabase = createClient();

  return useQuery<Expense[]>({
    queryKey: ['expenses', userId],
    queryFn: async () => {
      try {
        let query = supabase
          .from('t_expenses')
          .select(
            '*, t_projects(project_number, customer_name), expense_user:m_users!t_expenses_user_id_fkey(name)'
          )
          .is('deleted_at', null)
          .order('expense_date', { ascending: false });

        if (userId) {
          query = query.eq('user_id', userId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return mapExpenseRows(data);
      } catch {
        return DEMO_EXPENSES;
      }
    },
    staleTime: 1000 * 60,
  });
}

export function useCreateExpense() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (expense: Omit<Expense, 'id' | 'created_at' | 'project_number' | 'customer_name' | 'user_name'>) => {
      const { data, error } = await supabase
        .from('t_expenses')
        .insert(expense)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export { DEMO_EXPENSES };
