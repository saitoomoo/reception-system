import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import ScreenFooter from '@/components/screen-footer';

type BoothId = 'horse-race' | 'parkour' | 'chanbara';

const booths: { id: BoothId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'horse-race',
    label: '馬レース',
    icon: (
      <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: 'parkour',
    label: 'パルクール',
    icon: (
      <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
      </svg>
    ),
  },
  {
    id: 'chanbara',
    label: 'チャンバラ',
    icon: (
      <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
  },
];

export default function BoothSelectScreen() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [activeId, setActiveId] = useState<BoothId | null>(null);

  useEffect(() => {
    if (isAuthenticated) navigate('/mypage', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSelect = (id: BoothId) => {
    setActiveId(id);
    setTimeout(() => {
      setActiveId(null);
      navigate(`/booths/${id}`);
    }, 300);
  };

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-12">
        <h1 className="text-[28px] font-bold text-[#5A4A20] text-center">ブースを選択してください</h1>
      </header>

      <main className="flex-1 flex flex-col gap-6 px-8 pb-12">
        {booths.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => handleSelect(id)}
            className={`flex-1 min-h-[160px] bg-white rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.97] transition-all duration-150 ${
              activeId === id ? 'scale-[0.97]' : ''
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-3">
              {icon}
              <span className="text-[32px] font-bold text-[#5A4A20]">{label}</span>
            </div>
          </button>
        ))}
      </main>

      <ScreenFooter />
    </div>
  );
}
