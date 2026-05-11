import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Admin from './components/Admin';

type Screen =
  | 'booth-select'
  | 'booth-detail'
  | 'select'
  | 'input'
  | 'age-input'
  | 'consent'
  | 'completed'
  | 'reception-number'
  | 'waiting-status'
  | 'cheer'
  | 'staff-redirect'
  | 'mypage';
type VisitorType = 'reserved' | 'walkin' | null;
type BoothType = 'horse-race' | 'parkour' | 'chanbara' | null;

// PIN ハッシュ生成（SHA-256 + reception_number をソルト）(R-003)
const generatePinHash = async (pin: string, receptionNumber: string): Promise<string> => {
  const data = new TextEncoder().encode(pin + receptionNumber);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

export default function App() {
  const isAdminMode = new URLSearchParams(window.location.search).get('admin') === 'true';

  const [activeButton, setActiveButton] = useState<string | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('booth-select');
  const [selectedBooth, setSelectedBooth] = useState<BoothType>(null);
  const [visitorType, setVisitorType] = useState<VisitorType>(null);
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
  const [receptionNumber, setReceptionNumber] = useState<string | null>(null);
  const [inputReceptionNumber, setInputReceptionNumber] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCheerOpen, setIsCheerOpen] = useState(false);
  const [selectedHorse, setSelectedHorse] = useState<number | null>(null);
  const [carrotCount, setCarrotCount] = useState(0);

  // 現在時刻を1秒ごとに更新
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // localStorageに受付番号があれば直接マイページへ (R-003)
  useEffect(() => {
    if (isAdminMode) return;
    const stored = localStorage.getItem('reception_number');
    if (stored) {
      setReceptionNumber(stored);
      setCurrentScreen('mypage');
    }
  }, []);

  if (isAdminMode) {
    return <Admin />;
  }

  const handleBoothSelect = (booth: BoothType) => {
    setActiveButton(booth);
    setTimeout(() => {
      setActiveButton(null);
      setSelectedBooth(booth);
      setCurrentScreen('booth-detail');
      setIsDetailOpen(false);
      setIsCheerOpen(false);
    }, 300);
  };

  const handleProceedToReception = () => {
    setCurrentScreen('select');
  };

  const handleGoToCheer = () => {
    setCurrentScreen('cheer');
    setSelectedHorse(null);
    setCarrotCount(0);
  };

  const handleBackFromCheer = () => {
    setCurrentScreen('booth-detail');
  };

  const handleGiveCarrot = () => {
    if (selectedHorse !== null) {
      setCarrotCount(prev => prev + 1);
    }
  };

  const handleReserved = () => {
    setActiveButton('reserved');
    setTimeout(() => {
      setActiveButton(null);
      setVisitorType('reserved');
      setCurrentScreen('reception-number');
    }, 300);
  };

  const handleWalkIn = () => {
    setActiveButton('walkin');
    setTimeout(() => {
      setActiveButton(null);
      setVisitorType('walkin');
      setCurrentScreen('input');
    }, 300);
  };

  const resetFormState = () => {
    setVisitorType(null);
    setNickname('');
    setPartySize('');
    setPin('');
    setPinConfirm('');
    setPinError(null);
    setAges([]);
    setAgeError(null);
    setGuardianName('');
    setGuardianConsent(false);
    setHasScrolledConsent(false);
    setInputReceptionNumber('');
    setInputPin('');
  };

  const handleBack = () => {
    if (currentScreen === 'select') {
      setCurrentScreen('booth-detail');
      setVisitorType(null);
    } else if (currentScreen === 'booth-detail') {
      setCurrentScreen('booth-select');
      setSelectedBooth(null);
      setIsDetailOpen(false);
    } else if (currentScreen === 'staff-redirect') {
      setCurrentScreen('age-input');
    } else if (currentScreen === 'mypage') {
      // ログアウト：localStorageをクリアしてトップへ
      localStorage.removeItem('reception_number');
      localStorage.removeItem('pin_hash');
      setReceptionNumber(null);
      setCurrentScreen('booth-select');
    } else {
      setCurrentScreen('select');
      resetFormState();
      setReceptionNumber(null);
    }
  };

  const handleBackToInput = () => {
    setCurrentScreen('input');
    setAges([]);
    setAgeError(null);
  };

  const handleBackToAge = () => {
    setCurrentScreen('age-input');
    setGuardianName('');
    setGuardianConsent(false);
    setHasScrolledConsent(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin !== pinConfirm) {
      setPinError('PINが一致しません。もう一度確認してください。');
      return;
    }
    setPinError(null);
    const count = parseInt(partySize) || 0;
    setAges(new Array(count).fill(''));
    setCurrentScreen('age-input');
  };

  const handleAgeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAgeError(null);
    const parsedAges = ages.map(a => parseInt(a));

    // 7歳未満チェック (R-005)
    if (parsedAges.some(a => a < 7)) {
      setAgeError('7歳未満の方はご参加いただけません。受付スタッフにお声がけください。');
      return;
    }

    // 7〜9歳チェック → スタッフ介在の特殊フロー (R-005)
    if (parsedAges.some(a => a >= 7 && a <= 9)) {
      setCurrentScreen('staff-redirect');
      return;
    }

    // 13歳未満（10〜12歳）→ 保護者同意フロー (R-005)
    if (parsedAges.some(a => a < 13)) {
      setCurrentScreen('consent');
      return;
    }

    // 全員13歳以上 → 受付完了
    completeRegistration();
  };

  const completeRegistration = () => {
    // TODO: CreateVisitor RPC を呼び出し、レスポンスの reception_number を使用する (R-001)
    const receptionNum = `A-${(Math.floor(Math.random() * 999) + 1).toString().padStart(3, '0')}`;
    setReceptionNumber(receptionNum);
    generatePinHash(pin, receptionNum).then(hash => {
      localStorage.setItem('reception_number', receptionNum);
      localStorage.setItem('pin_hash', hash);
    });
    setCurrentScreen('completed');
  };

  const handleConsentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    completeRegistration();
  };

  const handleAgeChange = (index: number, value: string) => {
    if (/^\d{0,3}$/.test(value)) {
      const newAges = [...ages];
      newAges[index] = value;
      setAges(newAges);
    }
  };

  const handlePinChange = (value: string) => {
    if (/^\d{0,4}$/.test(value)) setPin(value);
  };

  const handlePinConfirmChange = (value: string) => {
    if (/^\d{0,4}$/.test(value)) setPinConfirm(value);
  };

  const handleInputPinChange = (value: string) => {
    if (/^\d{0,4}$/.test(value)) setInputPin(value);
  };

  const handleReceptionNumberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: AuthenticateVisitor RPC を呼び出す (R-004)
    setReceptionNumber(inputReceptionNumber);
    localStorage.setItem('reception_number', inputReceptionNumber);
    setCurrentScreen('waiting-status');
  };

  const handleConsentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      setHasScrolledConsent(true);
    }
  };

  const handleRefresh = () => {
    setCurrentDateTime(new Date());
  };

  // ── マイページ ──
  if (currentScreen === 'mypage') {
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
            onClick={() => setCurrentScreen('booth-select')}
            className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
          >
            <span className="text-[24px] font-bold text-[#5A4A20]">ブース選択へ</span>
          </button>

          <button
            onClick={() => {
              localStorage.removeItem('reception_number');
              localStorage.removeItem('pin_hash');
              setReceptionNumber(null);
              setCurrentScreen('booth-select');
            }}
            className="w-full py-4 active:scale-[0.98] transition-all duration-150"
          >
            <span className="text-[16px] text-[#5A4A20] opacity-60 underline">ログアウト（受付情報を削除）</span>
          </button>
        </main>

        <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
          お困りの際は受付スタッフまでお声がけください
        </footer>
      </div>
    );
  }

  // ── ブース選択 ──
  if (currentScreen === 'booth-select') {
    return (
      <div className="size-full flex flex-col bg-[#D4B946]">
        <header className="px-6 py-12">
          <h1 className="text-[28px] font-bold text-[#5A4A20] text-center">ブースを選択してください</h1>
        </header>

        <main className="flex-1 flex flex-col gap-6 px-8 pb-12">
          <button
            onClick={() => handleBoothSelect('horse-race')}
            className={`flex-1 min-h-[160px] bg-white rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.97] transition-all duration-150 ${
              activeButton === 'horse-race' ? 'scale-[0.97]' : ''
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-[32px] font-bold text-[#5A4A20]">馬レース</span>
            </div>
          </button>

          <button
            onClick={() => handleBoothSelect('parkour')}
            className={`flex-1 min-h-[160px] bg-white rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.97] transition-all duration-150 ${
              activeButton === 'parkour' ? 'scale-[0.97]' : ''
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
              </svg>
              <span className="text-[32px] font-bold text-[#5A4A20]">パルクール</span>
            </div>
          </button>

          <button
            onClick={() => handleBoothSelect('chanbara')}
            className={`flex-1 min-h-[160px] bg-white rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.97] transition-all duration-150 ${
              activeButton === 'chanbara' ? 'scale-[0.97]' : ''
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span className="text-[32px] font-bold text-[#5A4A20]">チャンバラ</span>
            </div>
          </button>
        </main>

        <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
          お困りの際は受付スタッフまでお声がけください
        </footer>
      </div>
    );
  }

  // ── ブース詳細 ──
  if (currentScreen === 'booth-detail') {
    const boothDetails = {
      'horse-race': {
        title: '馬レース',
        icon: (
          <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ),
        overview: 'VRゴーグルを装着し、仮想空間で馬に乗ってレースを楽しむ体験です。リアルな馬の動きと迫力あるコースで、実際に馬に乗っているような感覚を味わえます。',
        notes: ['身長120cm以上の方が対象です', '妊娠中の方、心臓疾患をお持ちの方はご利用いただけません', '酔いやすい方はご注意ください', '体験時間は約5分です']
      },
      'parkour': {
        title: 'パルクール',
        icon: (
          <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
          </svg>
        ),
        overview: '障害物を乗り越えたり、壁を登ったりするパルクールの動きをVR空間で体験できます。安全な環境で自由に街を駆け抜ける爽快感を味わえます。',
        notes: ['運動しやすい服装でお越しください', '裸足での体験となります', '激しい動きを伴いますので、体調の優れない方はご遠慮ください', '体験時間は約7分です']
      },
      'chanbara': {
        title: 'チャンバラ',
        icon: (
          <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        ),
        overview: 'VR空間で刀を振り、敵を倒していくアクションゲームです。時代劇の世界に入り込んだような臨場感あふれる戦闘を体験できます。',
        notes: ['周囲に十分なスペースが必要です', '腕を振り回す動作がありますので、肩や腕に痛みがある方はご注意ください', '刀型コントローラーを使用します', '体験時間は約6分です']
      }
    };

    const currentBooth = selectedBooth ? boothDetails[selectedBooth] : null;
    if (!currentBooth) return null;

    return (
      <div className="size-full flex flex-col bg-[#D4B946]">
        <header className="px-6 py-8 flex items-center">
          <button onClick={handleBack} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
            <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">{currentBooth.title}</h1>
        </header>

        <main className="flex-1 px-8 pb-8 overflow-y-auto">
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)] flex justify-center">
              {currentBooth.icon}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <h2 className="text-[18px] font-bold text-[#5A4A20] mb-3">概要</h2>
              <p className="text-[16px] text-[#5A4A20] leading-relaxed opacity-90">{currentBooth.overview}</p>
            </div>

            <div className="bg-white rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] overflow-hidden">
              <button
                onClick={() => setIsDetailOpen(!isDetailOpen)}
                className="w-full px-6 py-5 flex items-center justify-between active:bg-[#D4B946] active:bg-opacity-10 transition-colors"
              >
                <span className="text-[18px] font-bold text-[#5A4A20]">詳細説明</span>
                <svg className={`w-6 h-6 text-[#5A4A20] transition-transform duration-300 ${isDetailOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className={`transition-all duration-300 overflow-hidden ${isDetailOpen ? 'max-h-[1000px]' : 'max-h-0'}`}>
                <div className="px-6 pb-6 space-y-4">
                  <div>
                    <h3 className="text-[16px] font-bold text-[#5A4A20] mb-3">注意事項</h3>
                    <ul className="space-y-2">
                      {currentBooth.notes.map((note, index) => (
                        <li key={index} className="flex items-start gap-2">
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

            {selectedBooth === 'horse-race' && (
              <div className="bg-white rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] overflow-hidden">
                <button
                  onClick={() => setIsCheerOpen(!isCheerOpen)}
                  className="w-full px-6 py-5 flex items-center justify-between active:bg-[#D4B946] active:bg-opacity-10 transition-colors"
                >
                  <span className="text-[18px] font-bold text-[#5A4A20]">応援で参加</span>
                  <svg className={`w-6 h-6 text-[#5A4A20] transition-transform duration-300 ${isCheerOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div className={`transition-all duration-300 overflow-hidden ${isCheerOpen ? 'max-h-[500px]' : 'max-h-0'}`}>
                  <div className="px-6 pb-6 space-y-4">
                    <div className="bg-[#D4B946] bg-opacity-20 rounded-xl p-4">
                      <p className="text-[14px] text-[#5A4A20] leading-relaxed">
                        レース中の馬にニンジンを与えて応援できます！推し馬を1頭選んで、ニンジンボタンで応援しましょう。ニンジンをたくさんもらった馬は速く走ります。
                      </p>
                    </div>
                    <button
                      onClick={handleGoToCheer}
                      className="w-full bg-[#D4B946] py-5 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
                    >
                      <span className="text-[24px] font-bold text-white">応援へ！</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleProceedToReception}
              className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
            >
              <span className="text-[28px] font-bold text-[#5A4A20]">受付へ</span>
            </button>
          </div>
        </main>

        <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
          お困りの際は受付スタッフまでお声がけください
        </footer>
      </div>
    );
  }

  // ── 応援画面 ──
  if (currentScreen === 'cheer') {
    const horses = [
      { id: 1, name: 'サンダーボルト', color: 'bg-red-500', emoji: '🔴' },
      { id: 2, name: 'ブルースカイ', color: 'bg-blue-500', emoji: '🔵' },
      { id: 3, name: 'ゴールデンスター', color: 'bg-yellow-500', emoji: '🟡' },
      { id: 4, name: 'エメラルドウィンド', color: 'bg-green-500', emoji: '🟢' },
      { id: 5, name: 'ミッドナイトシャドウ', color: 'bg-purple-500', emoji: '🟣' }
    ];

    return (
      <div className="size-full flex flex-col bg-[#D4B946]">
        <header className="px-6 py-8 flex items-center">
          <button onClick={handleBackFromCheer} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
            <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">馬レース応援</h1>
        </header>

        <main className="flex-1 px-8 pb-8 overflow-y-auto">
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <p className="text-[16px] text-[#5A4A20] text-center font-bold mb-2">推し馬を1頭選んでください</p>
              <p className="text-[14px] text-[#5A4A20] text-center opacity-70">選んだ馬だけにニンジンを与えて応援できます</p>
            </div>

            <div className="space-y-3">
              {horses.map((horse) => (
                <button
                  key={horse.id}
                  onClick={() => setSelectedHorse(horse.id)}
                  className={`w-full p-5 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150 ${
                    selectedHorse === horse.id ? 'bg-[#D4B946] border-4 border-[#5A4A20]' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full ${horse.color} flex items-center justify-center text-[24px]`}>
                      {horse.emoji}
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-[18px] font-bold ${selectedHorse === horse.id ? 'text-white' : 'text-[#5A4A20]'}`}>
                        {horse.name}
                      </p>
                      <p className={`text-[14px] ${selectedHorse === horse.id ? 'text-white opacity-90' : 'text-[#5A4A20] opacity-70'}`}>
                        {horse.id}番
                      </p>
                    </div>
                    {selectedHorse === horse.id && (
                      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {selectedHorse !== null ? (
              <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                <div className="text-center mb-6">
                  <p className="text-[16px] text-[#5A4A20] font-bold mb-2">
                    {horses.find(h => h.id === selectedHorse)?.name}を応援中
                  </p>
                  <p className="text-[14px] text-[#5A4A20] opacity-70">ニンジンをあげた数: {carrotCount}本</p>
                </div>
                <button
                  onClick={handleGiveCarrot}
                  className="w-full bg-gradient-to-br from-orange-400 to-orange-600 py-8 rounded-2xl shadow-[0_6px_20px_rgba(255,120,0,0.4)] active:scale-[0.95] transition-all duration-150"
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[64px]">🥕</span>
                    <span className="text-[28px] font-bold text-white">ニンジンをあげる</span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                <p className="text-[16px] text-[#5A4A20] text-center opacity-70">まず推し馬を選んでください</p>
              </div>
            )}
          </div>
        </main>

        <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
          お困りの際は受付スタッフまでお声がけください
        </footer>
      </div>
    );
  }

  // ── ご用件選択 ──
  if (currentScreen === 'select') {
    return (
      <div className="size-full flex flex-col bg-[#D4B946]">
        <header className="px-6 py-8 flex items-center">
          <button onClick={handleBack} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
            <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">ご用件を選択してください</h1>
        </header>

        <main className="flex-1 flex flex-col gap-8 px-8 pb-12">
          {/* すでに受付をお済みの方（再ログイン）*/}
          <button
            onClick={handleReserved}
            className={`flex-1 min-h-[200px] bg-white rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.97] transition-all duration-150 ${
              activeButton === 'reserved' ? 'scale-[0.97]' : ''
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-[28px] font-bold text-[#5A4A20]">すでに受付をお済みの方</span>
            </div>
          </button>

          {/* はじめての方 */}
          <button
            onClick={handleWalkIn}
            className={`flex-1 min-h-[200px] bg-white rounded-3xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.97] transition-all duration-150 ${
              activeButton === 'walkin' ? 'scale-[0.97]' : ''
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <svg className="w-20 h-20 text-[#D4B946]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span className="text-[32px] font-bold text-[#5A4A20]">はじめての方</span>
            </div>
          </button>
        </main>

        <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
          お困りの際は受付スタッフまでお声がけください
        </footer>
      </div>
    );
  }

  // ── 再ログイン（受付番号 + PIN 入力）(R-004) ──
  if (currentScreen === 'reception-number') {
    return (
      <div className="size-full flex flex-col bg-[#D4B946]">
        <header className="px-6 py-8 flex items-center">
          <button onClick={handleBack} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
            <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">再ログイン</h1>
        </header>

        <main className="flex-1 px-8 pb-8 flex flex-col justify-center">
          <form onSubmit={handleReceptionNumberSubmit} className="space-y-6">
            <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <p className="text-[18px] font-bold text-[#5A4A20] text-center mb-6">
                受付番号とPINを入力してください
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-[16px] font-bold text-[#5A4A20] mb-2">受付番号</label>
                  <input
                    type="text"
                    value={inputReceptionNumber}
                    onChange={(e) => setInputReceptionNumber(e.target.value.toUpperCase())}
                    placeholder="例：A-105"
                    required
                    className="w-full px-4 py-5 text-[24px] text-center border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors tracking-widest"
                  />
                </div>

                <div>
                  <label className="block text-[16px] font-bold text-[#5A4A20] mb-2">4桁のPIN</label>
                  <input
                    type="tel"
                    value={inputPin}
                    onChange={(e) => handleInputPinChange(e.target.value)}
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

        <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
          お困りの際は受付スタッフまでお声がけください
        </footer>
      </div>
    );
  }

  // ── 待ち状況 ──
  if (currentScreen === 'waiting-status') {
    // TODO: GetTicketStatus / GetBoothStatus を5秒ごとに polling する (R-020)
    const callingNumber = 15;
    const waitingCount = 3;
    const waitingTime = 15;
    const absentCount = 0;
    const availabilityStatus = '○';

    const formatDateTime = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
      const weekday = weekdays[date.getDay()];
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${year}年${month}月${day}日(${weekday}) ${hours}:${minutes}時点`;
    };

    return (
      <div className="size-full flex flex-col bg-[#D4B946]">
        <header className="px-6 py-8 flex items-center justify-between">
          <button onClick={handleBack} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
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
                  onClick={handleRefresh}
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
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-[40px] font-bold ${
                  availabilityStatus === '○' ? 'bg-green-100 text-green-600' :
                  availabilityStatus === '△' ? 'bg-yellow-100 text-yellow-600' :
                  'bg-red-100 text-red-600'
                }`}>
                  {availabilityStatus}
                </div>
              </div>
            </div>

            <button
              onClick={handleBack}
              className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
            >
              <span className="text-[24px] font-bold text-[#5A4A20]">ネット受付へ</span>
            </button>
          </div>
        </main>

        <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
          お困りの際は受付スタッフまでお声がけください
        </footer>
      </div>
    );
  }

  // ── 受付完了 ──
  if (currentScreen === 'completed') {
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
                <p className="text-[52px] font-bold text-[#5A4A20] text-center leading-none">{receptionNumber}</p>
              </div>
            </div>
          </div>

          {/* QRコード (R-019: 受付番号のみ埋め込む) */}
          <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <p className="text-[18px] font-bold text-[#5A4A20] text-center mb-6">QRコード</p>
            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-xl border-4 border-[#D4B946]">
                <QRCodeSVG value={receptionNumber || ''} size={200} level="H" includeMargin={false} />
              </div>
            </div>
            <p className="mt-6 text-[14px] text-[#5A4A20] opacity-70 text-center">
              スタッフにこのQRコードをご提示ください
            </p>
          </div>

          {/* スクリーンショット促し */}
          <div className="bg-[#5A4A20] rounded-2xl p-5">
            <p className="text-[16px] text-[#D4B946] text-center font-bold">
              必ずスクリーンショットを撮ってください
            </p>
            <p className="text-[13px] text-white opacity-80 text-center mt-1">
              受付番号とQRコードをスクショで保存しておくと安心です
            </p>
          </div>

          <button
            onClick={() => setCurrentScreen('mypage')}
            className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
          >
            <span className="text-[24px] font-bold text-[#5A4A20]">マイページへ</span>
          </button>
        </main>

        <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
          お困りの際は受付スタッフまでお声がけください
        </footer>
      </div>
    );
  }

  // ── 保護者同意書（スクロール制御あり）(R-005-2) ──
  if (currentScreen === 'consent') {
    return (
      <div className="size-full flex flex-col bg-[#D4B946]">
        <header className="px-6 py-8 flex items-center">
          <button onClick={handleBackToAge} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
            <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">保護者同意書</h1>
        </header>

        <main className="flex-1 px-8 pb-8 overflow-y-auto">
          <form onSubmit={handleConsentSubmit} className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <div className="flex items-start gap-3 mb-4">
                <svg className="w-6 h-6 text-[#D4B946] flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-[16px] text-[#5A4A20] font-bold">13歳未満の参加者がいます</p>
              </div>
              <p className="text-[14px] text-[#5A4A20] opacity-80 leading-relaxed">
                13歳未満のお子様が参加される場合、保護者の方の同意が必要です。下記の同意書をご確認いただき、必要事項をご記入ください。
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <h2 className="text-[18px] font-bold text-[#5A4A20] mb-4">保護者同意書</h2>

              {/* リスク説明文（末尾までスクロール必須）(R-005-2) */}
              <div
                className="bg-[#D4B946] bg-opacity-10 rounded-xl p-4 mb-4 h-[200px] overflow-y-auto"
                onScroll={handleConsentScroll}
              >
                <p className="text-[14px] text-[#5A4A20] leading-relaxed">
                  <span className="block">私は、下記の未成年者の保護者として、本体験プログラムへの参加に同意いたします。</span>
                  <span className="block font-bold mt-4">【同意事項】</span>
                  <span className="block mt-2">1. 体験中の安全管理について、施設の指示に従うことを承諾します。</span>
                  <span className="block mt-2">2. 体験中に発生した事故・怪我について、施設の過失によらない場合は自己責任とすることを理解します。</span>
                  <span className="block mt-2">3. VR機器（HMD）の使用に際し、目の疲労・VR酔い・転倒等のリスクがあることを理解します。</span>
                  <span className="block mt-2">4. 緊急時の連絡先を正確に記入し、必要に応じて対応することを承諾します。</span>
                  <span className="block mt-2">5. 体験の様子を撮影した写真・動画が、施設の広報活動に使用される可能性があることを承諾します。</span>
                  <span className="block mt-4 font-bold">【注意事項】</span>
                  <span className="block mt-2">• 体験は7歳以上を対象としています。</span>
                  <span className="block mt-2">• 心臓疾患、高血圧、てんかん等の疾患をお持ちの方はご利用をお控えください。</span>
                  <span className="block mt-2">• 体験中に気分が悪くなった場合は、すぐにスタッフにお知らせください。</span>
                </p>
              </div>

              {!hasScrolledConsent && (
                <p className="text-[13px] text-[#D4B946] font-bold mb-4 text-center">
                  同意書を最後までスクロールすると同意できます
                </p>
              )}

              <div className="mt-4">
                <label className="block text-[16px] font-bold text-[#5A4A20] mb-3">保護者氏名</label>
                <input
                  type="text"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  placeholder="例：山田太郎"
                  required
                  className="w-full px-4 py-4 text-[18px] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
                />
              </div>

              <div className="mt-6">
                <label className={`flex items-start gap-3 ${hasScrolledConsent ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                  <input
                    type="checkbox"
                    checked={guardianConsent}
                    onChange={(e) => hasScrolledConsent && setGuardianConsent(e.target.checked)}
                    required
                    disabled={!hasScrolledConsent}
                    className={`mt-1 w-6 h-6 border-2 border-[#D4B946] rounded accent-[#D4B946] flex-shrink-0 ${!hasScrolledConsent ? 'opacity-40' : 'cursor-pointer'}`}
                  />
                  <span className={`text-[16px] font-bold ${hasScrolledConsent ? 'text-[#5A4A20]' : 'text-[#5A4A20] opacity-40'}`}>
                    上記の内容に同意し、保護者として署名します
                  </span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={!guardianConsent}
              className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:active:scale-100"
            >
              <span className="text-[28px] font-bold text-[#5A4A20]">次へ</span>
            </button>
          </form>
        </main>

        <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
          お困りの際は受付スタッフまでお声がけください
        </footer>
      </div>
    );
  }

  // ── 年齢入力 ──
  if (currentScreen === 'age-input') {
    return (
      <div className="size-full flex flex-col bg-[#D4B946]">
        <header className="px-6 py-8 flex items-center">
          <button onClick={handleBackToInput} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
            <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">年齢入力</h1>
        </header>

        <main className="flex-1 px-8 pb-8 overflow-y-auto">
          <form onSubmit={handleAgeSubmit} className="space-y-6">
            {/* 年齢制限の案内 */}
            <div className="bg-white rounded-2xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <p className="text-[13px] text-[#5A4A20] opacity-70 text-center">
                7歳未満の方はご参加いただけません。7〜9歳の方はスタッフにご相談ください。
              </p>
            </div>

            {ages.map((age, index) => (
              <div key={index} className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                <label className="block text-[18px] font-bold text-[#5A4A20] mb-3">参加者{index + 1}</label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => handleAgeChange(index, e.target.value)}
                  placeholder="年齢を入力"
                  min="0"
                  max="150"
                  required
                  className="w-full px-4 py-4 text-[20px] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
                />
              </div>
            ))}

            {/* エラーメッセージ */}
            {ageError && (
              <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[15px] text-red-700 font-bold">{ageError}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
            >
              <span className="text-[28px] font-bold text-[#5A4A20]">次へ</span>
            </button>
          </form>
        </main>

        <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
          お困りの際は受付スタッフまでお声がけください
        </footer>
      </div>
    );
  }

  // ── 7〜9歳特殊フロー誘導 (R-005) ──
  if (currentScreen === 'staff-redirect') {
    return (
      <div className="size-full flex flex-col bg-[#D4B946]">
        <header className="px-6 py-8 flex items-center">
          <button onClick={handleBack} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
            <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">スタッフへご相談ください</h1>
        </header>

        <main className="flex-1 px-8 pb-8 flex flex-col justify-center">
          <div className="bg-white rounded-2xl p-8 shadow-[0_4px_12px_rgba(0,0,0,0.15)] space-y-6">
            <div className="flex justify-center">
              <div className="w-24 h-24 bg-[#D4B946] rounded-full flex items-center justify-center">
                <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>

            <h2 className="text-[22px] font-bold text-[#5A4A20] text-center leading-relaxed">
              受付スタッフへ<br />お声がけください
            </h2>

            <div className="bg-[#D4B946] bg-opacity-20 rounded-xl p-5">
              <p className="text-[15px] text-[#5A4A20] leading-relaxed">
                7〜9歳の参加者がいる場合は、オンラインでの整理券取得ができません。受付スタッフのいる場所に直接お越しください。
              </p>
              <p className="text-[15px] text-[#5A4A20] leading-relaxed mt-3">
                保護者の方の同意書（用紙）をご記入いただき、スタッフが整理券を発行いたします。
              </p>
            </div>
          </div>
        </main>

        <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
          お困りの際は受付スタッフまでお声がけください
        </footer>
      </div>
    );
  }

  // ── 情報入力（デフォルト = input 画面）──
  return (
    <div className="size-full flex flex-col bg-[#D4B946]">
      <header className="px-6 py-8 flex items-center">
        <button onClick={handleBack} className="p-2 -ml-2 active:scale-95 transition-transform" aria-label="戻る">
          <svg className="w-8 h-8 text-[#5A4A20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-[24px] font-bold text-[#5A4A20] text-center pr-8">情報入力</h1>
      </header>

      <main className="flex-1 px-8 pb-8 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 代表者ニックネーム */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <label className="block text-[18px] font-bold text-[#5A4A20] mb-3">代表者ニックネーム</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="例：山田"
              required
              className="w-full px-4 py-4 text-[20px] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
            />
          </div>

          {/* 体験人数 */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <label className="block text-[18px] font-bold text-[#5A4A20] mb-3">体験人数</label>
            <input
              type="number"
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
              placeholder="例：2"
              min="1"
              required
              className="w-full px-4 py-4 text-[20px] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
            />
          </div>

          {/* 4桁のPIN */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <label className="block text-[18px] font-bold text-[#5A4A20] mb-3">4桁のPIN</label>
            <input
              type="tel"
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              placeholder="0000"
              maxLength={4}
              required
              pattern="\d{4}"
              inputMode="numeric"
              className="w-full px-4 py-4 text-[20px] text-center tracking-[0.5em] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
            />
            <p className="mt-2 text-[14px] text-[#5A4A20] opacity-70">
              ※ 再ログイン時に使用します。忘れないようにしてください
            </p>
          </div>

          {/* 4桁のPIN（確認）(auth.md §4-2) */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            <label className="block text-[18px] font-bold text-[#5A4A20] mb-3">4桁のPIN（確認）</label>
            <input
              type="tel"
              value={pinConfirm}
              onChange={(e) => handlePinConfirmChange(e.target.value)}
              placeholder="0000"
              maxLength={4}
              required
              pattern="\d{4}"
              inputMode="numeric"
              className="w-full px-4 py-4 text-[20px] text-center tracking-[0.5em] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
            />
            <p className="mt-2 text-[14px] text-[#5A4A20] opacity-70">
              ※ もう一度同じPINを入力してください
            </p>
          </div>

          {/* PINエラー */}
          {pinError && (
            <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4">
              <p className="text-[15px] text-red-700 font-bold text-center">{pinError}</p>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150"
          >
            <span className="text-[28px] font-bold text-[#5A4A20]">次へ</span>
          </button>
        </form>
      </main>

      <footer className="px-6 py-6 text-center text-[14px] text-[#5A4A20] opacity-70">
        お困りの際は受付スタッフまでお声がけください
      </footer>
    </div>
  );
}
