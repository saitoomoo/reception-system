import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { generatePinHash } from '@/lib/pin-hash';
import { visitorClient } from '@/lib/connect/client';
import ScreenFooter from '@/components/screen-footer';

export default function LoginScreen() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [receptionNumber, setReceptionNumber] = useState('');
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const authenticate = useMutation({
    mutationFn: ({ receptionNumber, pin }: { receptionNumber: string; pin: string }) =>
      visitorClient.authenticateVisitor({ receptionNumber, pin }) as Promise<{ receptionNumber: string; visitorId: string }>,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authenticate.isPending) return;
    setLoginError(null);
    try {
      const resp = await authenticate.mutateAsync({ receptionNumber, pin });
      const hash = await generatePinHash(pin, resp.receptionNumber);
      login(resp.receptionNumber, hash);
      navigate('/mypage');
    } catch {
      setLoginError('受付番号またはPINが違います');
    }
  };

  const handlePinChange = (value: string) => {
    if (/^\d{0,4}$/.test(value)) setPin(value);
  };

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-8 flex items-center">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
          <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">再ログイン</h1>
      </header>

      <main className="flex-1 px-8 pb-8 flex flex-col justify-center">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <p className="text-[18px] font-bold text-[#5A4A20] text-center mb-6">
              受付番号とPINを入力してください
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-[16px] font-bold text-[#5A4A20] mb-2">受付番号</label>
                <input
                  type="text"
                  value={receptionNumber}
                  onChange={(e) => setReceptionNumber(e.target.value.toUpperCase())}
                  placeholder="例：A-105"
                  required
                  className="w-full px-4 py-5 text-[24px] text-center border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors tracking-widest"
                />
              </div>
              <div>
                <label className="block text-[16px] font-bold text-[#5A4A20] mb-2">4桁のPIN</label>
                <input
                  type="tel"
                  value={pin}
                  onChange={(e) => handlePinChange(e.target.value)}
                  placeholder="0000"
                  maxLength={4}
                  required
                  pattern="\d{4}"
                  inputMode="numeric"
                  className="w-full px-4 py-5 text-[24px] text-center tracking-[0.5em] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
                />
              </div>
            </div>
          </div>

          {loginError && (
            <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4">
              <p className="text-[15px] text-red-700 font-bold text-center">{loginError}</p>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-3"
          >
            <span className="text-[28px] font-bold text-[#5A4A20]">ログイン</span>
            <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </main>

      <ScreenFooter />
    </div>
  );
}
