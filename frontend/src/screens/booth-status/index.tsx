import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { boothClient, ticketClient } from '@/lib/connect/client';
import ScreenFooter from '@/components/screen-footer';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateTime(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${WEEKDAYS[date.getDay()]}) ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}時点`;
}

// ─── タブ1: ブース全体の待ち状況 ───────────────────────────────────────────────

function BoothStatusTab({ boothId }: { boothId: string }) {
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());

  const { data, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['boothStatus', boothId],
    queryFn: () => boothClient.getBoothStatus({ boothId }),
    refetchInterval: 5_000,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isAvailable = data?.isAccepting && data?.isOpen;

  return (
    <div className="space-y-4">
      {/* 日時 + 更新ボタン */}
      <div className="bg-white rounded-2xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.15)] flex items-center justify-between">
        <p className="text-[13px] text-[#5A4A20] opacity-70">
          {formatDateTime(dataUpdatedAt ? new Date(dataUpdatedAt) : now)}
        </p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 px-3 py-1.5 bg-[#D4B946] rounded-lg text-white text-[13px] font-bold active:scale-95 transition-transform"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          更新
        </button>
      </div>

      {/* 呼出番号 + 待ち人数 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.15)] text-center">
          <p className="text-[13px] font-bold text-[#5A4A20] mb-2">呼出番号</p>
          <p className="text-[52px] font-bold text-[#D4B946] leading-none">
            {data?.calledSequence ?? '—'}
          </p>
          <p className="text-[16px] text-[#5A4A20] mt-1">番</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.15)] text-center">
          <p className="text-[13px] font-bold text-[#5A4A20] mb-2">待ち人数</p>
          <p className="text-[52px] font-bold text-[#D4B946] leading-none">
            {data?.waitingCount ?? '—'}
          </p>
          <p className="text-[16px] text-[#5A4A20] mt-1">人</p>
        </div>
      </div>

      {/* 待ち時間 */}
      <div className="bg-white rounded-2xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
        <div className="flex items-baseline justify-between">
          <p className="text-[16px] font-bold text-[#5A4A20]">待ち時間（目安）</p>
          <div className="flex items-baseline gap-1">
            <span className="text-[36px] font-bold text-[#D4B946]">
              {data?.estimatedWaitMinutes ?? '—'}
            </span>
            <span className="text-[18px] text-[#5A4A20]">分</span>
          </div>
        </div>
      </div>

      {/* 呼出待機者（pending） */}
      <div className="bg-white rounded-2xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
        <div className="flex items-baseline justify-between">
          <p className="text-[16px] font-bold text-[#5A4A20]">呼出待機者</p>
          <div className="flex items-baseline gap-1">
            <span className="text-[36px] font-bold text-[#5A4A20]">
              {data?.pendingCount ?? '—'}
            </span>
            <span className="text-[18px] text-[#5A4A20]">人</span>
          </div>
        </div>
      </div>

      {/* 空き状況 */}
      <div className="bg-white rounded-2xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-bold text-[#5A4A20]">現在の空き状況</p>
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-[28px] font-bold ${
            isAvailable ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
          }`}>
            {isAvailable ? '○' : '×'}
          </div>
        </div>
        {!data?.isAccepting && (
          <p className="text-[13px] text-red-500 mt-2">現在受付停止中です</p>
        )}
        {data?.isAccepting && !data?.isOpen && (
          <p className="text-[13px] text-[#5A4A20] opacity-60 mt-2">現在は受付時間外です</p>
        )}
      </div>

      {/* ネット受付へ */}
      {isAvailable && (
        <button
          onClick={() => navigate(`/booths/${boothId}/reserve`)}
          className="w-full bg-[#5A4A20] py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
        >
          <span className="text-[24px] font-bold text-[#D4B946]">ネット受付へ</span>
        </button>
      )}
    </div>
  );
}

// ─── タブ2: あなたの待ち状況 ───────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  waiting: '順番待ち中',
  called:  '呼び出されました！',
  pending: '保留中',
  admitted: '入場済み',
};

function MyStatusTab({ boothId }: { boothId: string }) {
  const savedReceptionNumber =
    typeof localStorage !== 'undefined' ? localStorage.getItem('reception_number') ?? '' : '';

  const [input, setInput] = useState(savedReceptionNumber);
  const [submitted, setSubmitted] = useState(!!savedReceptionNumber);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ticketStatusByReception', boothId, input],
    queryFn: () =>
      ticketClient.getTicketStatusByReceptionNumber({
        boothId,
        receptionNumber: input,
      }),
    enabled: submitted && !!input,
    refetchInterval: submitted ? 5_000 : false,
    retry: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    refetch();
  };

  return (
    <div className="space-y-4">
      {/* 受付番号フォーム */}
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
          <label className="block text-[14px] font-bold text-[#5A4A20] mb-2">
            あなたの受付番号
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => { setInput(e.target.value.toUpperCase()); setSubmitted(false); }}
              placeholder="A-001"
              className="flex-1 border-2 border-[#D4B946] rounded-xl px-4 py-3 text-[18px] font-bold text-[#5A4A20] placeholder:opacity-40 focus:outline-none focus:border-[#5A4A20]"
            />
            <button
              type="submit"
              disabled={!input}
              className="px-5 py-3 bg-[#5A4A20] rounded-xl text-[#D4B946] font-bold text-[15px] active:scale-95 transition-transform disabled:opacity-40"
            >
              確認
            </button>
          </div>
        </div>
      </form>

      {isLoading && (
        <p className="text-center text-[#5A4A20] opacity-60">確認中...</p>
      )}

      {isError && submitted && (
        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.15)] text-center">
          <p className="text-[16px] text-[#5A4A20] opacity-70">
            このブースの整理券が見つかりません
          </p>
          <p className="text-[13px] text-[#5A4A20] opacity-50 mt-1">
            受付番号をご確認ください
          </p>
        </div>
      )}

      {data && (
        <>
          {/* ステータス別メインカード */}
          {data.status === 'called' && (
            <div className="bg-green-100 rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border-4 border-green-400">
              <p className="text-[26px] font-bold text-green-700 text-center mb-2">
                呼び出されました！
              </p>
              <p className="text-[15px] text-green-800 text-center">{data.boothLocation} へお越しください</p>
            </div>
          )}

          {data.status === 'pending' && (
            <div className="bg-yellow-100 rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border-4 border-yellow-400">
              <p className="text-[22px] font-bold text-yellow-800 text-center mb-2">保留中</p>
              <p className="text-[14px] text-yellow-900 text-center">
                お時間のある時にいつでも<br />{data.boothLocation} へお越しください
              </p>
            </div>
          )}

          {data.status === 'admitted' && (
            <div className="bg-gray-100 rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)] text-center">
              <div className="w-16 h-16 bg-[#D4B946] rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[18px] font-bold text-[#5A4A20]">ご参加ありがとうございました！</p>
            </div>
          )}

          {/* 受付番号 + QR + 順位（waiting のみ順位を強調） */}
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[13px] text-[#5A4A20] opacity-60">受付番号</p>
                <p className="text-[28px] font-bold text-[#5A4A20]">{data.receptionNumber}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-[13px] font-bold ${
                data.status === 'waiting'  ? 'bg-blue-100 text-blue-700' :
                data.status === 'called'   ? 'bg-green-100 text-green-700' :
                data.status === 'pending'  ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {STATUS_LABEL[data.status] ?? data.status}
              </div>
            </div>

            {data.status === 'waiting' && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-[#D4B946] bg-opacity-15 rounded-xl p-3 text-center">
                  <p className="text-[12px] text-[#5A4A20] opacity-70">整理券番号</p>
                  <p className="text-[32px] font-bold text-[#D4B946] leading-none">{data.sequenceInBooth}</p>
                  <p className="text-[14px] text-[#5A4A20]">番</p>
                </div>
                <div className="bg-[#D4B946] bg-opacity-15 rounded-xl p-3 text-center">
                  <p className="text-[12px] text-[#5A4A20] opacity-70">あなたの前</p>
                  <p className="text-[32px] font-bold text-[#5A4A20] leading-none">{data.position}</p>
                  <p className="text-[14px] text-[#5A4A20]">人</p>
                </div>
              </div>
            )}

            {/* QRコード */}
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-xl border-4 border-[#D4B946]">
                <QRCodeSVG value={data.receptionNumber} size={160} level="H" includeMargin={false} />
              </div>
            </div>
            <p className="mt-3 text-[12px] text-[#5A4A20] opacity-60 text-center">
              スタッフにこのQRコードをご提示ください
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── メイン画面 ───────────────────────────────────────────────────────────────

export default function BoothStatusScreen() {
  const navigate = useNavigate();
  const { boothId } = useParams<{ boothId: string }>();
  const [tab, setTab] = useState<'booth' | 'mine'>('booth');

  const { data: boothData } = useQuery({
    queryKey: ['booth', boothId],
    queryFn: () => boothClient.getBooth({ boothId: boothId! }),
    enabled: !!boothId,
  });

  const boothName = boothData?.booth?.name ?? 'ブース';

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-8 flex items-center">
        <button
          onClick={() => navigate(`/booths/${boothId}`)}
          className="p-2 -ml-2 active:scale-95 transition-transform"
          aria-label="戻る"
        >
          <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-[22px] font-bold text-[#5A4A20] text-center pr-8">{boothName}</h1>
      </header>

      {/* タブ切替 */}
      <div className="mx-6 mb-4 flex rounded-xl overflow-hidden border-2 border-[#5A4A20]">
        <button
          onClick={() => setTab('booth')}
          className={`flex-1 py-3 text-[14px] font-bold transition-colors ${
            tab === 'booth'
              ? 'bg-[#5A4A20] text-[#D4B946]'
              : 'bg-transparent text-[#5A4A20]'
          }`}
        >
          現在の待ち状況
        </button>
        <button
          onClick={() => setTab('mine')}
          className={`flex-1 py-3 text-[14px] font-bold transition-colors ${
            tab === 'mine'
              ? 'bg-[#5A4A20] text-[#D4B946]'
              : 'bg-transparent text-[#5A4A20]'
          }`}
        >
          あなたの待ち状況
        </button>
      </div>

      <main className="flex-1 px-6 pb-8 overflow-y-auto">
        {tab === 'booth'
          ? <BoothStatusTab boothId={boothId!} />
          : <MyStatusTab boothId={boothId!} />
        }
      </main>

      <ScreenFooter />
    </div>
  );
}
