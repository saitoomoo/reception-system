import { useNavigate } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/hooks/use-auth';
import ScreenFooter from '@/components/screen-footer';

export default function MypageScreen() {
  const navigate = useNavigate();
  const { receptionNumber, logout } = useAuth();

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
