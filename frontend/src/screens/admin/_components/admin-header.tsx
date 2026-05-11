import { useEffect, useState } from 'react';
import { BoothType, PageType, BOOTH_NAMES, MENU_ITEMS } from '../types';

interface Props {
  currentPage: PageType;
  loggedInBooth: BoothType | null;
  onMenuToggle: () => void;
  onLogout: () => void;
}

export default function AdminHeader({ currentPage, loggedInBooth, onMenuToggle, onLogout }: Props) {
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDateTime = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  const currentPageTitle = MENU_ITEMS.find((m) => m.id === currentPage)?.label ?? '管理者画面';

  return (
    <header className="bg-[#D4B946] shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onMenuToggle} className="p-2 hover:bg-[#B89D3A] rounded-lg transition-colors">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h1 className="text-[24px] font-bold text-white">{currentPageTitle}</h1>
              {loggedInBooth && (
                <div className="text-xs text-yellow-100">{BOOTH_NAMES[loggedInBooth]} 担当</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-white text-[14px]">{formatDateTime(currentDateTime)}</div>
            <button
              onClick={onLogout}
              className="px-3 py-1 bg-[#B89D3A] text-white text-sm font-bold rounded-lg hover:bg-[#9A7E2A] transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
