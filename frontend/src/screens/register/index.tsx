import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { generatePinHash } from '@/lib/pin-hash';
import { visitorClient, ticketClient, boothClient, adminClient } from '@/lib/connect/client';
import ScreenFooter from '@/components/screen-footer';
import InputStep from './_components/input-step';
import AgeInputStep from './_components/age-input-step';
import ConsentStep from './_components/consent-step';
import StaffRedirectStep from './_components/staff-redirect-step';
import MatchModeStep from './_components/match-mode-step';

type Step = 'input' | 'match-mode' | 'age-input' | 'consent' | 'staff-redirect';

const STEP_TITLES: Record<Step, string> = {
  'input': '情報入力',
  'match-mode': '参加方法を選択',
  'age-input': '年齢入力',
  'consent': '保護者同意書',
  'staff-redirect': 'スタッフへご相談ください',
};


export default function RegisterScreen() {
  const navigate = useNavigate();
  const { boothId } = useParams();
  const { login, isAuthenticated, visitorId: existingVisitorId, receptionNumber: existingReceptionNumber } = useAuth();

  const { data: boothData } = useQuery({
    queryKey: ['booth', boothId],
    queryFn: () => boothClient.getBooth({ boothId: boothId! }),
    enabled: !!boothId,
  });

  const booth = boothData?.booth;
  const isMatchmaking = booth?.experienceType === 'matchmaking';
  const maxPartySize = booth?.maxParticipantsPerTicket ?? undefined;

  const { data: riskData } = useQuery({
    queryKey: ['riskExplanation'],
    queryFn: () => adminClient.getRiskExplanation({}),
  });
  const riskBody = riskData?.body ?? '';

  const createVisitor = useMutation({
    mutationFn: ({ nickname, pin }: { nickname: string; pin: string }) =>
      visitorClient.createVisitor({ nickname, pin }) as Promise<{ receptionNumber: string; visitorId: string }>,
  });

  const [step, setStep] = useState<Step>('input');
  const [nickname, setNickname] = useState('');
  const [partySize, setPartySize] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [ages, setAges] = useState<string[]>([]);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [guardianName, setGuardianName] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [hasScrolledConsent, setHasScrolledConsent] = useState(false);
  const [matchMode, setMatchMode] = useState<'public' | 'private' | ''>('');
  const [registerError, setRegisterError] = useState<string | null>(null);

  const handleBack = () => {
    if (step === 'input') {
      navigate(`/booths/${boothId}/reserve`);
    } else if (step === 'match-mode') {
      setMatchMode('');
      setStep('input');
    } else if (step === 'age-input') {
      setAges([]);
      setAgeError(null);
      setStep(isMatchmaking ? 'match-mode' : 'input');
    } else if (step === 'consent') {
      setGuardianName('');
      setGuardianConsent(false);
      setHasScrolledConsent(false);
      setStep('age-input');
    } else if (step === 'staff-redirect') {
      setStep('age-input');
    }
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated && pin !== pinConfirm) {
      setPinError('PINが一致しません。もう一度確認してください。');
      return;
    }
    setPinError(null);
    const count = parseInt(partySize) || 0;
    setAges(new Array(count).fill(''));
    if (isMatchmaking) {
      setStep('match-mode');
    } else {
      setStep('age-input');
    }
  };

  const handleMatchModeSelect = (mode: 'public' | 'private') => {
    setMatchMode(mode);
    setStep('age-input');
  };

  const handleAgeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createVisitor.isPending) return;
    setAgeError(null);
    const parsedAges = ages.map(a => parseInt(a));

    if (parsedAges.some(a => a < 7)) {
      setAgeError('7歳未満の方はご参加いただけません。受付スタッフにお声がけください。');
      return;
    }
    if (parsedAges.some(a => a >= 7 && a <= 9)) {
      setStep('staff-redirect');
      return;
    }
    if (parsedAges.some(a => a < 13)) {
      setStep('consent');
      return;
    }
    completeRegistration();
  };

  const completeRegistration = async () => {
    setRegisterError(null);
    try {
      let visitorIdToUse: string;
      let receptionNumberToUse: string;

      if (isAuthenticated && existingVisitorId) {
        visitorIdToUse = existingVisitorId;
        receptionNumberToUse = existingReceptionNumber ?? '';
      } else {
        const resp = await createVisitor.mutateAsync({ nickname, pin });
        const hash = await generatePinHash(pin, resp.receptionNumber);
        login(resp.receptionNumber, hash, resp.visitorId);
        visitorIdToUse = resp.visitorId;
        receptionNumberToUse = resp.receptionNumber;
      }

      const parsedAges = ages.map(a => parseInt(a));
      const participants = parsedAges.map(age => ({ age, name: '' }));

      const needsConsent = parsedAges.some(a => a < 13);
      const parentalConsent = needsConsent
        ? {
            guardianName,
            consentTextSnapshot: riskBody,
            userAgent: navigator.userAgent,
            ipAddress: '0.0.0.0',
          }
        : undefined;

      const ticketResp = await ticketClient.createTicket({
        visitorId: visitorIdToUse,
        boothId: boothId!,
        pin: isAuthenticated ? '' : pin,
        participants,
        matchMode: matchMode,
        parentalConsent,
      });

      navigate(`/booths/${boothId}/reserve/new/complete`, {
        state: { receptionNumber: receptionNumberToUse, ticketId: ticketResp.ticketId },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('elapsed') || msg.toLowerCase().includes('cooldown')) {
        setRegisterError('クールダウン中です。前回の体験からしばらく経ってから再度お試しください。');
      } else if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('already_exists')) {
        setRegisterError('このブースの整理券はすでに取得済みです。マイページから確認してください。');
      } else {
        setRegisterError('登録に失敗しました。もう一度お試しください。');
      }
    }
  };

  const handleConsentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createVisitor.isPending) return;
    completeRegistration();
  };

  const handleConsentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      setHasScrolledConsent(true);
    }
  };

  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-8 flex items-center">
        <button onClick={handleBack} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
          <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">{STEP_TITLES[step]}</h1>
      </header>

      <main className="flex-1 px-8 pb-8 overflow-y-auto">
        {registerError && (
          <div className="mb-4 bg-red-50 border-2 border-red-300 rounded-2xl p-4">
            <p className="text-[15px] text-red-700 font-bold text-center">{registerError}</p>
          </div>
        )}
        {step === 'input' && !isAuthenticated && (
          <InputStep
            nickname={nickname}
            partySize={partySize}
            pin={pin}
            pinConfirm={pinConfirm}
            pinError={pinError}
            maxPartySize={maxPartySize}
            onNicknameChange={setNickname}
            onPartySizeChange={setPartySize}
            onPinChange={setPin}
            onPinConfirmChange={setPinConfirm}
            onSubmit={handleInputSubmit}
            onBack={handleBack}
          />
        )}
        {step === 'input' && isAuthenticated && (
          <form onSubmit={handleInputSubmit} className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <p className="text-[15px] text-[#5A4A20] opacity-70 text-center">
                受付番号 {existingReceptionNumber} でログイン中
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <label className="block text-[18px] font-bold text-[#5A4A20] mb-3">体験人数</label>
              <input
                type="number"
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                placeholder="人数を入力"
                min="1"
                max={maxPartySize ?? 10}
                required
                className="w-full px-4 py-4 text-[20px] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
            >
              <span className="text-[28px] font-bold text-[#5A4A20]">次へ</span>
            </button>
          </form>
        )}
        {step === 'match-mode' && (
          <MatchModeStep
            allowPrivateMatch={booth?.allowPrivateMatch ?? false}
            onSelect={handleMatchModeSelect}
          />
        )}
        {step === 'age-input' && (
          <AgeInputStep
            ages={ages}
            ageError={ageError}
            onAgeChange={(i, v) => {
              const next = [...ages];
              next[i] = v;
              setAges(next);
            }}
            onSubmit={handleAgeSubmit}
            onBack={handleBack}
          />
        )}
        {step === 'consent' && (
          <ConsentStep
            riskBody={riskBody}
            guardianName={guardianName}
            guardianConsent={guardianConsent}
            hasScrolledConsent={hasScrolledConsent}
            onGuardianNameChange={setGuardianName}
            onGuardianConsentChange={setGuardianConsent}
            onScroll={handleConsentScroll}
            onSubmit={handleConsentSubmit}
            onBack={handleBack}
          />
        )}
        {step === 'staff-redirect' && (
          <StaffRedirectStep onBack={handleBack} />
        )}
      </main>

      <ScreenFooter />
    </div>
  );
}
