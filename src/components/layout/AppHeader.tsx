'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase';

export function AppHeader() {
  const { user } = useAuthStore();
  const [companyBrand, setCompanyBrand] = useState('');

  const loadBrand = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from('m_settings').select('value').eq('key', 'company_name').maybeSingle();
    const name = (data?.value as string | undefined)?.trim();
    setCompanyBrand(name || '業務管理');
  }, []);

  useEffect(() => {
    void loadBrand();
    const onUpdate = () => void loadBrand();
    window.addEventListener('company-brand-updated', onUpdate);
    return () => window.removeEventListener('company-brand-updated', onUpdate);
  }, [loadBrand]);

  return (
    <header className="sticky top-0 z-[100] bg-white border-b-2 border-line-green px-4 py-3">
      <div className="max-w-[500px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-icons text-line-green text-[28px]">business</span>
          <div>
            <p className="text-[0.95rem] font-bold text-gray-900 leading-tight">
              {companyBrand || '…'} Mobile
            </p>
            <p className="text-[0.65rem] text-line-green leading-tight">
              LINE公式アカウント連携
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-line-green flex items-center justify-center">
                <span className="material-icons text-white text-sm">person</span>
              </div>
            )}
            <span className="text-[0.8rem] text-gray-600 max-w-[80px] truncate">
              {user?.name ?? '未ログイン'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
