import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import ScreenFooter from '@/components/screen-footer';

// TODO: GetTicketStatus / GetBoothStatus を5秒ごとに polling する (R-020)
const MOCK_STATUS = { callingNumber: 15, waitingCount: 3, waitingTime: 15, absentCount: 0, availabilityStatus: '○' as '○' | '△' | '×' };

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const formatDateTime = (date: Date) =>
  `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${WEEKDAYS[date.getDay()]}) ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}時点`;

export default function WaitingStatusScreen() {
  const navigate = useNavigate();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const { callingNumber, waitingCount, waitingTime, absentCount, availabilityStatus } = MOCK_STATUS;

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const availabilityColor =
    availabilityStatus === '○' ? 'bg-green-100 text-green-600' :
    availabilityStatus === '△' ? 'bg-yellow-100 text-yellow-600' :
    'bg-red-100 text-red-600';

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-8 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
          <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center">私たちの待ち状況</h1>
        <div className="w-8" />
      </header>

      <main className="flex-1 px-8 pb-8 overflow-y-auto">
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <div className="flex items-center justify-between">
              <p className="text-[16px] text-[#5A4A20]">{formatDateTime(currentDateTime)}</p>
              <button
                onClick={() => setCurrentDateTime(new Date())}
                className="px-4 py-2 bg-[#D4B946] rounded-lg text-white font-bold text-[14px] active:scale-95 transition-transform flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                更新
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <p className="text-[16px] text-[#5A4A20] mb-3 text-center font-bold">呼出番号</p>
              <p className="text-[56px] font-bold text-[#D4B946] text-center leading-none">{callingNumber}</p>
              <p className="text-[20px] text-[#5A4A20] text-center mt-2">番</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <p className="text-[16px] text-[#5A4A20] mb-3 text-center font-bold">待ち人数</p>
              <p className="text-[56px] font-bold text-[#D4B946] text-center leading-none">{waitingCount}</p>
              <p className="text-[20px] text-[#5A4A20] text-center mt-2">人</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <div className="flex items-baseline justify-between">
              <p className="text-[18px] font-bold text-[#5A4A20]">待ち時間（目安）</p>
              <div className="flex items-baseline gap-2">
                <span className="text-[40px] font-bold text-[#D4B946]">{waitingTime}</span>
                <span className="text-[20px] text-[#5A4A20]">分</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <div className="flex items-baseline justify-between">
              <p className="text-[18px] font-bold text-[#5A4A20]">呼出不在者</p>
              <div className="flex items-baseline gap-2">
                <span className="text-[40px] font-bold text-[#5A4A20]">{absentCount}</span>
                <span className="text-[20px] text-[#5A4A20]">人</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <div className="flex items-center justify-between">
              <p className="text-[18px] font-bold text-[#5A4A20]">現在の空き状況</p>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-[40px] font-bold ${availabilityColor}`}>
                {availabilityStatus}
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/mypage')}
            className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
          >
            <span className="text-[24px] font-bold text-[#5A4A20]">マイページへ</span>
          </button>
        </div>
      </main>

      <ScreenFooter />
    </div>
  );
}
