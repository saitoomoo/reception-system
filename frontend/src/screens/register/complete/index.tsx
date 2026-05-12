import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/hooks/use-auth';
import ScreenFooter from '@/components/screen-footer';
import { isPushSupported, registerPush } from '@/lib/push/register';
import { subscribePush } from '@/lib/push/subscribe';

export default function RegisterCompleteScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { receptionNumber, visitorId } = useAuth();
  const [pushState, setPushState] = useState<'idle' | 'requesting' | 'done' | 'denied'>('idle');

  const state = location.state as { receptionNumber?: string; ticketId?: string } | null;
  const displayNumber = state?.receptionNumber ?? receptionNumber;
  const ticketId = state?.ticketId;

  const handleEnableNotifications = async () => {
    if (!visitorId) return;
    setPushState('requesting');
    const granted = await registerPush();
    if (!granted) {
      setPushState('denied');
      return;
    }
    await subscribePush(visitorId);
    setPushState('done');
  };

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-12">
        <h1 className="text-[28px] font-bold text-[#5A4A20] text-center">受付完了</h1>
      </header>

      <main className="flex-1 flex flex-col gap-6 px-8 pb-12 overflow-y-auto">
        <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 bg-[#D4B946] rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[20px] text-[#5A4A20] text-center font-bold">受付完了しました</p>
            <div className="bg-[#D4B946] bg-opacity-20 rounded-xl p-6 w-full">
              <p className="text-[16px] text-[#5A4A20] text-center mb-2">あなたの受付番号は</p>
              <p className="text-[52px] font-bold text-[#5A4A20] text-center leading-none">{displayNumber}</p>
            </div>
          </div>
        </div>

        {/* QRコード (R-019: 受付番号のみ埋め込む) */}
        <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
          <p className="text-[18px] font-bold text-[#5A4A20] text-center mb-6">QRコード</p>
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-xl border-4 border-[#D4B946]">
              <QRCodeSVG value={displayNumber || ''} size={200} level="H" includeMargin={false} />
            </div>
          </div>
          <p className="mt-6 text-[14px] text-[#5A4A20] opacity-70 text-center">
            スタッフにこのQRコードをご提示ください
          </p>
        </div>

        <div className="bg-[#5A4A20] rounded-2xl p-5">
          <p className="text-[16px] text-[#D4B946] text-center font-bold">
            必ずスクリーンショットを撮ってください
          </p>
          <p className="text-[13px] text-white opacity-80 text-center mt-1">
            受付番号とQRコードをスクショで保存しておくと安心です
          </p>
        </div>

        {/* Web Push 通知の案内 */}
        {isPushSupported() && pushState === 'idle' && (
          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <p className="text-[16px] font-bold text-[#5A4A20] text-center mb-2">
              呼び出し通知を受け取りますか？
            </p>
            <p className="text-[13px] text-[#5A4A20] opacity-70 text-center mb-4">
              整理券の順番が来たとき、ブラウザを閉じていても通知でお知らせします
            </p>
            <button
              onClick={handleEnableNotifications}
              className="w-full bg-[#D4B946] py-4 rounded-xl font-bold text-[#5A4A20] text-[16px] active:scale-[0.98] transition-all duration-150"
            >
              通知を有効にする
            </button>
            <button
              onClick={() => setPushState('done')}
              className="w-full mt-2 py-3 text-[14px] text-[#5A4A20] opacity-60"
            >
              スキップ
            </button>
          </div>
        )}
        {pushState === 'requesting' && (
          <div className="bg-white rounded-2xl p-6 text-center text-[14px] text-[#5A4A20] opacity-70">
            通知の許可をリクエスト中...
          </div>
        )}
        {pushState === 'done' && (
          <div className="bg-white rounded-2xl p-5 text-center text-[14px] text-[#5A4A20] font-bold">
            ✓ 通知が有効になりました
          </div>
        )}
        {pushState === 'denied' && (
          <div className="bg-white rounded-2xl p-5 text-center text-[14px] text-[#5A4A20] opacity-70">
            通知が許可されませんでした。画面を開いたままにすることで順番を確認できます。
          </div>
        )}

        {ticketId && (
          <button
            onClick={() => navigate(`/mypage/waiting?ticketId=${ticketId}`)}
            className="w-full bg-[#5A4A20] py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
          >
            <span className="text-[24px] font-bold text-[#D4B946]">待ち状況を確認する</span>
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
