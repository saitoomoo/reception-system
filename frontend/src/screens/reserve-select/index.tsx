import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import ScreenFooter from '@/components/screen-footer';

export default function ReserveSelectScreen() {
  const navigate = useNavigate();
  const { boothId } = useParams();
  const [activeButton, setActiveButton] = useState<string | null>(null);

  const handleSelect = (type: 'reserved' | 'walkin') => {
    setActiveButton(type);
    setTimeout(() => {
      setActiveButton(null);
      if (type === 'reserved') {
        navigate('/login');
      } else {
        navigate(`/booths/${boothId}/reserve/new`);
      }
    }, 300);
  };

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-8 flex items-center">
        <button onClick={() => navigate(`/booths/${boothId}`)} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
          <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">ご用件を選択してください</h1>
      </header>

      <main className="flex-1 flex flex-col gap-8 px-8 pb-12">
        <button
          onClick={() => handleSelect('reserved')}
          className={`flex-1 min-h-[200px] bg-white rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.97] transition-all duration-150 ${
            activeButton === 'reserved' ? 'scale-[0.97]' : ''
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-3">
            <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[28px] font-bold text-[#5A4A20]">すでに受付をお済みの方</span>
          </div>
        </button>

        <button
          onClick={() => handleSelect('walkin')}
          className={`flex-1 min-h-[200px] bg-white rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.97] transition-all duration-150 ${
            activeButton === 'walkin' ? 'scale-[0.97]' : ''
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-3">
            <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <span className="text-[32px] font-bold text-[#5A4A20]">はじめての方</span>
          </div>
        </button>
      </main>

      <ScreenFooter />
    </div>
  );
}
