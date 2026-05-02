'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import type { Project } from '@/types';

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
