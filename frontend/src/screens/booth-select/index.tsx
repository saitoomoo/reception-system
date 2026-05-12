import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { boothClient } from '@/lib/connect/client';
import ScreenFooter from '@/components/screen-footer';
import type { BoothSummary } from '@/gen/ts/booth/v1/booth_pb';

const EXPERIENCE_TYPE_LABEL: Record<string, string> = {
  sequential: '順次体験',
  parallel: '同時体験',
  individual: '個人体験',
  matchmaking: 'マッチング',
};

export default function BoothSelectScreen() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data, isLoading: boothsLoading } = useQuery({
    queryKey: ['booths'],
    queryFn: () => boothClient.listBooths({}),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/mypage', { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  const booths: BoothSummary[] = data?.booths ?? [];

  const handleSelect = (id: string) => {
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
        {boothsLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[18px] text-[#5A4A20] opacity-70">読み込み中...</p>
          </div>
        ) : booths.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[18px] text-[#5A4A20] opacity-70">ブース情報がありません</p>
          </div>
        ) : (
          booths.map((booth) => (
            <button
              key={booth.id}
              onClick={() => handleSelect(booth.id)}
              disabled={!booth.isAccepting}
              className={`flex-1 bg-white rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] overflow-hidden transition-all duration-150 ${
                booth.isAccepting
                  ? `active:scale-[0.97] ${activeId === booth.id ? 'scale-[0.97]' : ''}`
                  : 'opacity-60'
              }`}
            >
              {booth.coverImageUrl && (
                <img
                  src={booth.coverImageUrl}
                  alt={booth.name}
                  className="w-full h-32 object-cover"
                />
              )}
              <div className={`flex flex-col items-center justify-center gap-2 p-6 ${!booth.coverImageUrl ? 'min-h-[160px]' : ''}`}>
                <span className="text-[32px] font-bold text-[#5A4A20]">{booth.name}</span>
                {booth.experienceType && (
                  <span className="text-[12px] font-bold text-[#5A4A20] bg-[#D4B946] bg-opacity-40 px-3 py-1 rounded-full">
                    {EXPERIENCE_TYPE_LABEL[booth.experienceType] ?? booth.experienceType}
                  </span>
                )}
                <span className="text-[15px] text-[#5A4A20] opacity-70">{booth.location}</span>
                {booth.isAccepting ? (
                  <span className="text-[16px] text-[#5A4A20] opacity-80">
                    待ち {booth.waitingCount}人 / 約{booth.estimatedWaitMinutes}分
                  </span>
                ) : (
                  <span className="text-[16px] text-red-500 font-bold">受付停止中</span>
                )}
              </div>
            </button>
          ))
        )}
      </main>

      <ScreenFooter />
    </div>
  );
}
