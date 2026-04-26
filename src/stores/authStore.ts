import { create } from 'zustand';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isDemoMode: boolean;

  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setDemoMode: (demo: boolean) => void;
  clearAuth: () => void;
}

// デモユーザー（LIFF未設定時に使用）
export const DEMO_USER: User = {
  id: 'demo-user-001',
  name: '山田太郎',
  role: 'sales',
  email: 'yamada@lapin-reform.jp',
  status: 'active',
  can_register_project: true,
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isDemoMode: false,

  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setDemoMode: (isDemoMode) => set({ isDemoMode }),
  clearAuth: () => set({ user: null, isDemoMode: false }),
}));
