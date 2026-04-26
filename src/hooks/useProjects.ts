'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import type { Project } from '@/types';

// デモ用案件データ（Supabase未接続時に使用）
const DEMO_PROJECTS: Project[] = [
  {
    id: '1',
    project_number: '2026-001',
    customer_name: '田中一郎',
    address: '大阪市北区梅田1-1-1',
    phone: '06-1234-5678',
    work_description: '外壁・屋根塗装工事',
    work_type: ['外壁塗装', '屋根塗装'],
    estimated_amount: 1200000,
    contract_amount: 1200000,
    acquisition_route: 'チラシ',
    assigned_to: 'demo-user-001',
    assigned_to_name: '山田太郎',
    status: 'in_progress',
    inquiry_date: '2026-01-15',
    planned_budget: 720000,
    actual_cost: 350000,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
  {
    id: '2',
    project_number: '2026-002',
    customer_name: '鈴木花子',
    address: '大阪市中央区難波2-2-2',
    phone: '06-2345-6789',
    work_description: 'キッチンリフォーム',
    work_type: ['キッチン'],
    estimated_amount: 850000,
    contract_amount: 850000,
    acquisition_route: 'Web自然流入',
    assigned_to: 'demo-user-001',
    assigned_to_name: '山田太郎',
    status: 'contract',
    inquiry_date: '2026-02-10',
    created_at: '2026-02-10T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
  {
    id: '3',
    project_number: '2026-003',
    customer_name: '高橋健太',
    address: '大阪市天王寺区上本町3-3-3',
    phone: '06-3456-7890',
    work_description: '浴室・トイレリフォーム',
    work_type: ['浴室', 'トイレ'],
    estimated_amount: 1500000,
    acquisition_route: '紹介',
    assigned_to: 'demo-user-001',
    assigned_to_name: '山田太郎',
    status: 'estimate',
    inquiry_date: '2026-03-20',
    created_at: '2026-03-20T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
  },
  {
    id: '4',
    project_number: '2026-004',
    customer_name: '伊藤美咲',
    address: '堺市堺区市之町東4-4-4',
    phone: '072-234-5678',
    work_description: '内装フルリフォーム',
    work_type: ['内装'],
    estimated_amount: 2200000,
    contract_amount: 2100000,
    acquisition_route: 'OB施策',
    assigned_to: 'demo-user-001',
    assigned_to_name: '山田太郎',
    status: 'completed',
    inquiry_date: '2025-10-01',
    created_at: '2025-10-01T00:00:00Z',
    updated_at: '2026-02-28T00:00:00Z',
  },
  {
    id: '5',
    project_number: '2026-005',
    customer_name: '渡辺次郎',
    address: '豊中市岡町5-5-5',
    phone: '06-4567-8901',
    work_description: '外構工事',
    work_type: ['外構'],
    estimated_amount: 680000,
    acquisition_route: 'LINE',
    assigned_to: 'demo-user-001',
    assigned_to_name: '山田太郎',
    status: 'inquiry',
    inquiry_date: '2026-04-20',
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
  },
];

export function useProjects() {
  const supabase = createClient();

  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false });

        if (error) throw error;
        return (data as Project[]) ?? DEMO_PROJECTS;
      } catch {
        return DEMO_PROJECTS;
      }
    },
    staleTime: 1000 * 60,
    initialData: DEMO_PROJECTS,
  });
}

export function useActiveProjects() {
  const { data: projects = [] } = useProjects();
  return projects.filter((p) => !['completed', 'lost'].includes(p.status));
}

export { DEMO_PROJECTS };
