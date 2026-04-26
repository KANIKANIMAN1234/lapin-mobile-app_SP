import { AppHeader } from '@/components/layout/AppHeader';
import { BottomNav } from '@/components/layout/BottomNav';
import { Providers } from '@/components/ui/Providers';

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="max-w-[500px] mx-auto px-3 pt-3 pb-[70px]">
          {children}
        </main>
        <BottomNav />
      </div>
    </Providers>
  );
}
