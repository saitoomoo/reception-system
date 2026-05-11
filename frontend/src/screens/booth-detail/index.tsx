import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { boothClient } from '@/lib/connect/client';
import { DetailAccordion, CheerAccordion } from './_components/detail-accordion';
import ScreenFooter from '@/components/screen-footer';

function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  return m ? m[1] : null;
}

export default function BoothDetailScreen() {
  const navigate = useNavigate();
  const { boothId } = useParams<{ boothId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['booth', boothId],
    queryFn: () => boothClient.getBooth({ boothId: boothId! }),
    enabled: !!boothId,
  });

  if (isLoading) {
    return (
      <div className="size-full flex items-center justify-center bg-[#D4B946]">
        <p className="text-[18px] text-[#5A4A20] opacity-70">読み込み中...</p>
      </div>
    );
  }

  if (!data?.booth) return null;

  const booth = data.booth;
  const ytVideoId = extractYouTubeVideoId(booth.introVideoUrl);

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-8 flex items-center">
        <button onClick={() => navigate('/')} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
          <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">{booth.name}</h1>
      </header>

      <main className="flex-1 px-8 pb-8 overflow-y-auto">
        <div className="space-y-6">
          {booth.coverImageUrl ? (
            <div className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <img src={booth.coverImageUrl} alt={booth.name} className="w-full h-48 object-cover" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)] flex justify-center">
              <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          )}

          {ytVideoId && (
            <div className="rounded-2xl overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.15)] aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${ytVideoId}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={booth.name}
              />
            </div>
          )}

          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <h2 className="text-[18px] font-bold text-[#5A4A20] mb-3">概要</h2>
            <p className="text-[16px] text-[#5A4A20] leading-relaxed opacity-90">{booth.description}</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <div className="flex justify-between items-center">
              <span className="text-[16px] text-[#5A4A20]">現在の待ち</span>
              <span className="text-[20px] font-bold text-[#D4B946]">{booth.waitingCount}人 / 約{booth.estimatedWaitMinutes}分</span>
            </div>
          </div>

          <DetailAccordion notes={[]} />

          {booth.id === '1' && <CheerAccordion />}

          <button
            onClick={() => navigate(`/booths/${boothId}/status`)}
            className="w-full bg-white/70 py-4 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.10)] active:scale-[0.98] transition-all duration-150"
          >
            <span className="text-[20px] font-bold text-[#5A4A20]">現在の待ち状況</span>
          </button>

          {booth.isAccepting ? (
            <button
              onClick={() => navigate(`/booths/${boothId}/reserve`)}
              className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
            >
              <span className="text-[28px] font-bold text-[#5A4A20]">受付へ</span>
            </button>
          ) : (
            <div className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] text-center opacity-60">
              <span className="text-[24px] font-bold text-red-500">受付停止中</span>
            </div>
          )}
        </div>
      </main>

      <ScreenFooter />
    </div>
  );
}
