'use client';

import { getLineLoginUrl } from '@/lib/auth';

export default function LoginPage() {
  const handleLineLogin = () => {
    window.location.href = getLineLoginUrl();
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'linear-gradient(135deg, #06C755 0%, #04a045 50%, #1d4ed8 100%)',
      }}
    >
      <div className="bg-white rounded-2xl p-8 shadow-2xl text-center w-full max-w-sm">
        {/* アイコン */}
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 rounded-2xl bg-[#06C755] flex items-center justify-center shadow-md">
            <span className="material-icons text-white" style={{ fontSize: 40 }}>
              business
            </span>
          </div>
        </div>

        <h1 className="text-xl font-bold mb-1 text-gray-800">ラパンリフォーム</h1>
        <p className="text-sm text-gray-500 mb-1">業務管理システム</p>
        <p className="text-[10px] text-gray-400 mb-8 bg-blue-50 rounded-lg px-3 py-1.5">
          Mobile版
        </p>

        {/* LINEログインボタン */}
        <button
          onClick={handleLineLogin}
          className="w-full flex items-center justify-center gap-3 bg-[#06C755] hover:bg-[#05a548] active:bg-[#04913d] text-white font-bold py-4 px-6 rounded-xl shadow-md transition-colors text-base"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.035 2 11.05c0 4.495 3.455 8.255 8.13 9.022.315.065.745.2.855.46.097.237.063.608.031.85l-.138.798c-.042.244-.193.955.838.521 1.03-.434 5.56-3.275 7.59-5.607C20.803 15.16 22 13.198 22 11.05 22 6.034 17.52 2 12 2z" />
          </svg>
          LINEでログイン
        </button>

        <p className="text-[10px] text-gray-400 mt-5">
          LINEアカウントで認証後、自動的にログインします
        </p>
      </div>
    </div>
  );
}
