import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import ScreenFooter from '@/components/screen-footer';

const HORSES = [
  { id: 1, name: 'サンダーボルト', color: 'bg-red-500', emoji: '🔴' },
  { id: 2, name: 'ブルースカイ', color: 'bg-blue-500', emoji: '🔵' },
  { id: 3, name: 'ゴールデンスター', color: 'bg-yellow-500', emoji: '🟡' },
  { id: 4, name: 'エメラルドウィンド', color: 'bg-green-500', emoji: '🟢' },
  { id: 5, name: 'ミッドナイトシャドウ', color: 'bg-purple-500', emoji: '🟣' },
];

export default function CheerScreen() {
  const navigate = useNavigate();
  const { boothId } = useParams();
  const [selectedHorse, setSelectedHorse] = useState<number | null>(null);
  const [carrotCount, setCarrotCount] = useState(0);

  const handleSelectHorse = (id: number) => {
    setSelectedHorse(id);
    setCarrotCount(0);
  };

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-8 flex items-center">
        <button onClick={() => navigate(`/booths/${boothId}`)} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
          <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">馬レース応援</h1>
      </header>

      <main className="flex-1 px-8 pb-8 overflow-y-auto">
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <p className="text-[16px] text-[#5A4A20] text-center font-bold mb-2">推し馬を1頭選んでください</p>
            <p className="text-[14px] text-[#5A4A20] text-center opacity-70">選んだ馬だけにニンジンを与えて応援できます</p>
          </div>

          <div className="space-y-3">
            {HORSES.map((horse) => (
              <button
                key={horse.id}
                onClick={() => handleSelectHorse(horse.id)}
                className={`w-full p-5 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150 ${
                  selectedHorse === horse.id ? 'bg-[#D4B946] border-4 border-[#5A4A20]' : 'bg-white'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full ${horse.color} flex items-center justify-center text-[24px]`}>
                    {horse.emoji}
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-[18px] font-bold ${selectedHorse === horse.id ? 'text-white' : 'text-[#5A4A20]'}`}>
                      {horse.name}
                    </p>
                    <p className={`text-[14px] ${selectedHorse === horse.id ? 'text-white opacity-90' : 'text-[#5A4A20] opacity-70'}`}>
                      {horse.id}番
                    </p>
                  </div>
                  {selectedHorse === horse.id && (
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>

          {selectedHorse !== null ? (
            <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <div className="text-center mb-6">
                <p className="text-[16px] text-[#5A4A20] font-bold mb-2">
                  {HORSES.find(h => h.id === selectedHorse)?.name}を応援中
                </p>
                <p className="text-[14px] text-[#5A4A20] opacity-70">ニンジンをあげた数: {carrotCount}本</p>
              </div>
              <button
                onClick={() => setCarrotCount(prev => prev + 1)}
                className="w-full bg-gradient-to-br from-orange-400 to-orange-600 py-8 rounded-2xl shadow-[0_6px_20px_rgba(255,120,0,0.4)] active:scale-[0.95] transition-all duration-150"
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[64px]">🥕</span>
                  <span className="text-[28px] font-bold text-white">ニンジンをあげる</span>
                </div>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <p className="text-[16px] text-[#5A4A20] text-center opacity-70">まず推し馬を選んでください</p>
            </div>
          )}
        </div>
      </main>

      <ScreenFooter />
    </div>
  );
}
