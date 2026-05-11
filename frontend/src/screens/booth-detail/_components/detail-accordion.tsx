import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';

interface Props {
  notes: string[];
}

export function DetailAccordion({ notes }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-5 flex items-center justify-between active:bg-[#D4B946] active:bg-opacity-10 transition-colors"
      >
        <span className="text-[18px] font-bold text-[#5A4A20]">詳細説明</span>
        <svg className={`w-6 h-6 text-[#5A4A20] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[1000px]' : 'max-h-0'}`}>
        <div className="px-6 pb-6 space-y-4">
          <div>
            <h3 className="text-[16px] font-bold text-[#5A4A20] mb-3">注意事項</h3>
            <ul className="space-y-2">
              {notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[#D4B946] mt-1">•</span>
                  <span className="text-[14px] text-[#5A4A20] opacity-90 flex-1">{note}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-[16px] font-bold text-[#5A4A20] mb-3">説明動画</h3>
            <div className="bg-[#D4B946] bg-opacity-20 rounded-xl p-8 flex flex-col items-center justify-center min-h-[180px]">
              <svg className="w-16 h-16 text-[#5A4A20] opacity-40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[14px] text-[#5A4A20] opacity-60">動画は後日追加予定です</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CheerAccordion() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { boothId } = useParams();

  return (
    <div className="bg-white rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-5 flex items-center justify-between active:bg-[#D4B946] active:bg-opacity-10 transition-colors"
      >
        <span className="text-[18px] font-bold text-[#5A4A20]">応援で参加</span>
        <svg className={`w-6 h-6 text-[#5A4A20] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[500px]' : 'max-h-0'}`}>
        <div className="px-6 pb-6 space-y-4">
          <div className="bg-[#D4B946] bg-opacity-20 rounded-xl p-4">
            <p className="text-[14px] text-[#5A4A20] leading-relaxed">
              レース中の馬にニンジンを与えて応援できます！推し馬を1頭選んで、ニンジンボタンで応援しましょう。ニンジンをたくさんもらった馬は速く走ります。
            </p>
          </div>
          <button
            onClick={() => navigate(`/booths/${boothId}/cheer`)}
            className="w-full bg-[#D4B946] py-5 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
          >
            <span className="text-[24px] font-bold text-white">応援へ！</span>
          </button>
        </div>
      </div>
    </div>
  );
}
