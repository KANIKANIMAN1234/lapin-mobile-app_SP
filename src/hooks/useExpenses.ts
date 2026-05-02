'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import type { Expense } from '@/types';

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
