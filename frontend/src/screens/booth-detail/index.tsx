import { useNavigate, useParams } from 'react-router';
import { DetailAccordion, CheerAccordion } from './_components/detail-accordion';
import ScreenFooter from '@/components/screen-footer';

type BoothId = 'horse-race' | 'parkour' | 'chanbara';

const BOOTH_DATA: Record<BoothId, {
  title: string;
  icon: React.ReactNode;
  overview: string;
  notes: string[];
}> = {
  'horse-race': {
    title: '馬レース',
    icon: (
      <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    overview: 'VRゴーグルを装着し、仮想空間で馬に乗ってレースを楽しむ体験です。リアルな馬の動きと迫力あるコースで、実際に馬に乗っているような感覚を味わえます。',
    notes: ['身長120cm以上の方が対象です', '妊娠中の方、心臓疾患をお持ちの方はご利用いただけません', '酔いやすい方はご注意ください', '体験時間は約5分です'],
  },
  'parkour': {
    title: 'パルクール',
    icon: (
      <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
      </svg>
    ),
    overview: '障害物を乗り越えたり、壁を登ったりするパルクールの動きをVR空間で体験できます。安全な環境で自由に街を駆け抜ける爽快感を味わえます。',
    notes: ['運動しやすい服装でお越しください', '裸足での体験となります', '激しい動きを伴いますので、体調の優れない方はご遠慮ください', '体験時間は約7分です'],
  },
  'chanbara': {
    title: 'チャンバラ',
    icon: (
      <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
    overview: 'VR空間で刀を振り、敵を倒していくアクションゲームです。時代劇の世界に入り込んだような臨場感あふれる戦闘を体験できます。',
    notes: ['周囲に十分なスペースが必要です', '腕を振り回す動作がありますので、肩や腕に痛みがある方はご注意ください', '刀型コントローラーを使用します', '体験時間は約6分です'],
  },
};

export default function BoothDetailScreen() {
  const navigate = useNavigate();
  const { boothId } = useParams<{ boothId: BoothId }>();
  const booth = boothId ? BOOTH_DATA[boothId] : null;

  if (!booth) return null;

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-8 flex items-center">
        <button onClick={() => navigate('/')} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
          <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">{booth.title}</h1>
      </header>

      <main className="flex-1 px-8 pb-8 overflow-y-auto">
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)] flex justify-center">
            {booth.icon}
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <h2 className="text-[18px] font-bold text-[#5A4A20] mb-3">概要</h2>
            <p className="text-[16px] text-[#5A4A20] leading-relaxed opacity-90">{booth.overview}</p>
          </div>

          <DetailAccordion notes={booth.notes} />

          {boothId === 'horse-race' && <CheerAccordion />}

          <button
            onClick={() => navigate(`/booths/${boothId}/reserve`)}
            className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
          >
            <span className="text-[28px] font-bold text-[#5A4A20]">受付へ</span>
          </button>
        </div>
      </main>

      <ScreenFooter />
    </div>
  );
}
