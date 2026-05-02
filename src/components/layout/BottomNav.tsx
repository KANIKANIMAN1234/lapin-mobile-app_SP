'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

const NAV_ITEMS = [
  { href: '/expense', icon: 'add_circle', label: '経費', color: 'text-line-green' },
  { href: '/attendance', icon: 'schedule', label: '出退勤', color: 'text-line-green' },
  { href: '/report', icon: 'description', label: '日報', color: 'text-line-green' },
  { href: '/site-photo', icon: 'photo_library', label: '現場写真', color: 'text-line-green' },
  { href: '/map', icon: 'map', label: '地図', color: 'text-line-green' },
  { href: '/history', icon: 'receipt_long', label: '履歴', color: 'text-line-green' },
  { href: '/summary', icon: 'pie_chart', label: '集計', color: 'text-line-green' },
];

const REGISTER_ITEM = {
  href: '/new-project',
  icon: 'note_add',
  label: '新規登録',
  color: 'text-blue-500',
};

const NOTICE_ITEM = {
  href: '/notice',
  icon: 'campaign',
  label: '連絡投稿',
  color: 'text-orange-500',
};

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const isAdmin = user?.role === 'admin';
  const canRegister = user?.can_register_project === true;

  const items = [
    ...NAV_ITEMS,
    ...(canRegister ? [REGISTER_ITEM] : []),
    ...(isAdmin ? [NOTICE_ITEM] : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] h-[60px]">
      <div className="max-w-[500px] mx-auto h-full flex items-center">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center h-full gap-0.5 transition-colors ${
                isActive ? item.color : 'text-gray-400'
              }`}
            >
              <span className="material-icons text-[20px]">{item.icon}</span>
              <span className="text-[0.55rem] font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
