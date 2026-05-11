import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/hooks/use-auth';
import { ticketClient } from '@/lib/connect/client';
import ScreenFooter from '@/components/screen-footer';
import type { TicketSummary } from '@/gen/ts/ticket/v1/ticket_pb';

const STATUS_LABEL: Record<string, string> = {
  waiting: '待機中',
  called: '呼び出し中',
  pending: '保留中',
  admitted: '入場済み',
  cancelled: 'キャンセル済み',
};

const STATUS_COLOR: Record<string, string> = {
  waiting: 'bg-blue-100 text-blue-700',
  called: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  admitted: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-gray-100 text-gray-400',
};

export default function MypageScreen() {
  const navigate = useNavigate();
  const { receptionNumber, visitorId, logout } = useAuth();

  const { data } = useQuery({
    queryKey: ['myTickets', visitorId],
    queryFn: () => ticketClient.listMyTickets({ visitorId: visitorId! }),
    enabled: !!visitorId,
    refetchInterval: 10_000,
  });

  const tickets: TicketSummary[] = data?.tickets ?? [];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-12">
        <h1 className="text-[28px] font-bold text-[#5A4A20] text-center">マイページ</h1>
      </header>

      <main className="flex-1 flex flex-col gap-6 px-8 pb-12 overflow-y-auto">
        <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)] text-center">
          <p className="text-[16px] text-[#5A4A20] mb-2">あなたの受付番号</p>
          <p className="text-[52px] font-bold text-[#5A4A20] leading-none">{receptionNumber}</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
          <p className="text-[18px] font-bold text-[#5A4A20] text-center mb-6">QRコード</p>
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-xl border-4 border-[#D4B946]">
              <QRCodeSVG value={receptionNumber || ''} size={200} level="H" includeMargin={false} />
            </div>
          </div>
          <p className="mt-4 text-[14px] text-[#5A4A20] opacity-70 text-center">
            スタッフにこのQRコードをご提示ください
          </p>
        </div>

        {tickets.length > 0 && (
          <div className="bg-white rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] overflow-hidden">
            <p className="text-[18px] font-bold text-[#5A4A20] px-6 pt-6 pb-3">整理券一覧</p>
            <div className="divide-y divide-gray-100">
              {tickets.map((ticket) => (
                <button
                  key={ticket.ticketId}
                  onClick={() => navigate(`/mypage/waiting?ticketId=${ticket.ticketId}`)}
                  className="w-full flex items-center justify-between px-6 py-4 active:bg-gray-50 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-[16px] font-bold text-[#5A4A20]">{ticket.boothName}</p>
                    {ticket.status === 'waiting' && (
                      <p className="text-[13px] text-[#5A4A20] opacity-70">前に {ticket.position}人</p>
                    )}
                  </div>
                  <span className={`text-[13px] font-bold px-3 py-1 rounded-full ${STATUS_COLOR[ticket.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[ticket.status] ?? ticket.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => navigate('/')}
          className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
        >
          <span className="text-[24px] font-bold text-[#5A4A20]">ブース選択へ</span>
        </button>

        <button
          onClick={handleLogout}
          className="w-full py-4 active:scale-[0.98] transition-all duration-150"
        >
          <span className="text-[16px] text-[#5A4A20] opacity-60 underline">ログアウト（受付情報を削除）</span>
        </button>
      </main>

      <ScreenFooter />
    </div>
  );
}
