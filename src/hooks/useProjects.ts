'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import type { Project, ProjectStatus } from '@/types';

/** 経費紐付け可とする案件（契約以降・失注前） */
export const CONTRACTED_PROJECT_STATUSES: readonly ProjectStatus[] = [
  'contract',
  'in_progress',
  'completed',
] as const;

export function useProjects() {
  const supabase = createClient();

  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('t_projects')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[useProjects] Supabase error:', error);
        throw error;
      }
      return (data as Project[]) ?? [];
    },
    staleTime: 1000 * 60,
  });
}

export function useActiveProjects() {
  const { data: projects = [] } = useProjects();
  return projects.filter((p) => !['completed', 'lost'].includes(p.status));
}

/** 契約済み案件のみ（問合せ〜追客は除外） */
export function useContractedProjects() {
  const q = useProjects();
  const data = (q.data ?? []).filter((p) => CONTRACTED_PROJECT_STATUSES.includes(p.status));
  return { ...q, data };
}
