import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { ticketClient, boothClient } from '@/lib/connect/client';
import ScreenFooter from '@/components/screen-footer';

export default function WaitingStatusScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ticketId = searchParams.get('ticketId');
  const { visitorId } = useAuth();
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ticketStatus', ticketId],
    queryFn: () => ticketClient.getTicketStatus({ ticketId: ticketId! }),
    enabled: !!ticketId,
    refetchInterval: 5_000,
  });

  const status = data?.status;

  const { data: boothData } = useQuery({
    queryKey: ['booth', data?.boothId],
    queryFn: () => boothClient.getBooth({ boothId: data!.boothId }),
    enabled: !!data?.boothId && status === 'admitted',
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      ticketClient.cancelTicket({ ticketId: ticketId!, visitorId: visitorId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketStatus', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['myTickets'] });
    },
  });

  useEffect(() => {
    if (status === 'called' && prevStatusRef.current !== 'called') {
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
    }
    prevStatusRef.current = status ?? null;
  }, [status]);

  if (!ticketId) {
    return (
      <div className="size-full flex flex-col bg-[#D4B946]">
        <main className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
          <p className="text-[18px] text-[#5A4A20] opacity-70">整理券が見つかりません</p>
          <button
            onClick={() => navigate('/mypage')}
            className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
          >
            <span className="text-[24px] font-bold text-[#5A4A20]">マイページへ</span>
          </button>
        </main>
        <ScreenFooter />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="size-full flex items-center justify-center bg-[#D4B946]">
        <p className="text-[18px] text-[#5A4A20] opacity-70">読み込み中...</p>
      </div>
    );
  }

  const canCancel = status === 'waiting' || status === 'called' || status === 'pending';
  const surveyUrl = boothData?.booth?.surveyUrl;

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-8 flex items-center">
        <button onClick={() => navigate('/mypage')} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
          <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">待ち状況</h1>
      </header>

      <main className="flex-1 flex flex-col gap-6 px-8 pb-12 overflow-y-auto">
        {status === 'called' && (
          <div className="bg-green-100 rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border-4 border-green-400">
            <p className="text-[28px] font-bold text-green-700 text-center mb-4">呼び出されました！</p>
            <p className="text-[16px] text-green-800 text-center">
              {data?.boothLocation} へお越しください
            </p>
          </div>
        )}

        {status === 'waiting' && (
          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <p className="text-[18px] font-bold text-[#5A4A20] text-center mb-6">順番待ち中</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#D4B946] bg-opacity-20 rounded-xl p-4 text-center">
                <p className="text-[14px] text-[#5A4A20] mb-2">整理券番号</p>
                <p className="text-[48px] font-bold text-[#D4B946] leading-none">{data?.sequenceInBooth}</p>
                <p className="text-[18px] text-[#5A4A20] mt-1">番</p>
              </div>
              <div className="bg-[#D4B946] bg-opacity-20 rounded-xl p-4 text-center">
                <p className="text-[14px] text-[#5A4A20] mb-2">あなたの前</p>
                <p className="text-[48px] font-bold text-[#5A4A20] leading-none">{data?.position}</p>
                <p className="text-[18px] text-[#5A4A20] mt-1">人</p>
              </div>
            </div>
          </div>
        )}

        {status === 'pending' && (
          <div className="bg-yellow-100 rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)] border-4 border-yellow-400">
            <p className="text-[24px] font-bold text-yellow-800 text-center mb-4">保留中</p>
            <p className="text-[15px] text-yellow-900 text-center leading-relaxed">
              お時間のある時にいつでも<br />
              {data?.boothLocation} へお越しください
            </p>
          </div>
        )}

        {status === 'admitted' && (
          <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-[#D4B946] rounded-full flex items-center justify-center">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[20px] font-bold text-[#5A4A20] text-center">ご参加ありがとうございました！</p>
              {surveyUrl && (
                <a
                  href={surveyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-[#5A4A20] py-5 rounded-2xl text-center active:scale-[0.98] transition-all duration-150 block"
                >
                  <span className="text-[20px] font-bold text-[#D4B946]">アンケートに回答する</span>
                </a>
              )}
            </div>
          </div>
        )}

        {status === 'cancelled' && (
          <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)] text-center">
            <p className="text-[20px] font-bold text-gray-500">キャンセル済み</p>
            <p className="text-[14px] text-gray-400 mt-2">この整理券はキャンセルされました</p>
          </div>
        )}

        {data && (
          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <p className="text-[18px] font-bold text-[#5A4A20]">{data.boothName}</p>
            <p className="text-[14px] text-[#5A4A20] opacity-70 mt-1">{data.boothLocation}</p>
          </div>
        )}

        {canCancel && (
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="w-full py-4 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
          >
            <span className="text-[16px] text-[#5A4A20] opacity-60 underline">
              {cancelMutation.isPending ? 'キャンセル中...' : '整理券をキャンセル'}
            </span>
          </button>
        )}

        <button
          onClick={() => navigate('/mypage')}
          className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
        >
          <span className="text-[24px] font-bold text-[#5A4A20]">マイページへ</span>
        </button>
      </main>

      <ScreenFooter />
    </div>
  );
}
