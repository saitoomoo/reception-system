import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { generatePinHash } from '@/lib/pin-hash';
import { visitorClient } from '@/lib/connect/client';
import ScreenFooter from '@/components/screen-footer';
import InputStep from './_components/input-step';
import AgeInputStep from './_components/age-input-step';
import ConsentStep from './_components/consent-step';
import StaffRedirectStep from './_components/staff-redirect-step';

type Step = 'input' | 'age-input' | 'consent' | 'staff-redirect';

const STEP_TITLES: Record<Step, string> = {
  'input': '情報入力',
  'age-input': '年齢入力',
  'consent': '保護者同意書',
  'staff-redirect': 'スタッフへご相談ください',
};

export default function RegisterScreen() {
  const navigate = useNavigate();
  const { boothId } = useParams();
  const { login } = useAuth();

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
  const [registerError, setRegisterError] = useState<string | null>(null);

  const handleBack = () => {
    if (step === 'input') {
      navigate(`/booths/${boothId}/reserve`);
    } else if (step === 'age-input') {
      setAges([]);
      setAgeError(null);
      setStep('input');
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
    if (pin !== pinConfirm) {
      setPinError('PINが一致しません。もう一度確認してください。');
      return;
    }
    setPinError(null);
    const count = parseInt(partySize) || 0;
    setAges(new Array(count).fill(''));
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
      const resp = await createVisitor.mutateAsync({ nickname, pin });
      const hash = await generatePinHash(pin, resp.receptionNumber);
      login(resp.receptionNumber, hash);
      navigate(`/booths/${boothId}/reserve/new/complete`, { state: { receptionNumber: resp.receptionNumber } });
    } catch {
      setRegisterError('登録に失敗しました。もう一度お試しください。');
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
        {step === 'input' && (
          <InputStep
            nickname={nickname}
            partySize={partySize}
            pin={pin}
            pinConfirm={pinConfirm}
            pinError={pinError}
            onNicknameChange={setNickname}
            onPartySizeChange={setPartySize}
            onPinChange={setPin}
            onPinConfirmChange={setPinConfirm}
            onSubmit={handleInputSubmit}
            onBack={handleBack}
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
