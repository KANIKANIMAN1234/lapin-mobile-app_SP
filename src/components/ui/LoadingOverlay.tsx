'use client';

interface LoadingOverlayProps {
  show: boolean;
  message?: string;
}

export function LoadingOverlay({ show, message = '処理中...' }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-white/85">
      <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-line-green animate-spin mb-3" />
      <p className="text-gray-500 text-sm">{message}</p>
    </div>
  );
}
