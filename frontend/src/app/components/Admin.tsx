import { useState, useEffect } from 'react';

type ReceptionStatus = 'waiting' | 'called' | 'admitted' | 'cancelled' | 'pending';
type BoothType = 'horse-race' | 'parkour' | 'chanbara';
type PageType = 'reservations-all' | 'reservations-horse' | 'reservations-parkour' | 'reservations-chanbara' | 'booth-settings';

interface Reception {
  id: number;
  receptionNumber: string;
  booth: BoothType;
  nickname: string;
  partySize: number;
  ages: number[];
  guardianName?: string;
  status: ReceptionStatus;
  is_priority_call?: boolean;
  timestamp: Date;
  calledAt?: Date;
  admittedAt?: Date;
}

interface BoothSettings {
  name: string;
  overview: string;
  notes: string[];
  videoUrl: string;
  duration: number;
  capacity: number;
  minAge: number;
  minHeight: number;
  isActive: boolean;
  internalNotes: string;
}

// ブース別の共有パスワード（モック）
const BOOTH_PASSWORDS: Record<BoothType, string> = {
  'horse-race': '1234',
  'parkour': '1234',
  'chanbara': '1234',
};

export default function Admin() {
  // ログイン状態
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginBooth, setLoginBooth] = useState<BoothType>('horse-race');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggedInBooth, setLoggedInBooth] = useState<BoothType | null>(null);

  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [currentPage, setCurrentPage] = useState<PageType>('reservations-all');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedBooth, setSelectedBooth] = useState<BoothType | 'all'>('all');
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [searchNumber, setSearchNumber] = useState('');
  const [selectedBoothTab, setSelectedBoothTab] = useState<BoothType>('horse-race');
  const [boothSettings, setBoothSettings] = useState<Record<BoothType, BoothSettings>>({
    'horse-race': {
      name: '馬レース',
      overview: 'VRゴーグルを装着し、仮想空間で馬に乗ってレースを楽しむ体験です。リアルな馬の動きと迫力あるコースで、実際に馬に乗っているような感覚を味わえます。',
      notes: [
        '身長120cm以上の方が対象です',
        '妊娠中の方、心臓疾患をお持ちの方はご利用いただけません',
        '酔いやすい方はご注意ください',
        '体験時間は約5分です'
      ],
      videoUrl: '',
      duration: 5,
      capacity: 4,
      minAge: 6,
      minHeight: 120,
      isActive: true,
      internalNotes: 'VRゴーグルを使用します'
    },
    'parkour': {
      name: 'パルクール',
      overview: '障害物を乗り越えたり、壁を登ったりするパルクールの動きをVR空間で体験できます。安全な環境で自由に街を駆け抜ける爽快感を味わえます。',
      notes: [
        '運動しやすい服装でお越しください',
        '裸足での体験となります',
        '激しい動きを伴いますので、体調の優れない方はご遠慮ください',
        '体験時間は約7分です'
      ],
      videoUrl: '',
      duration: 7,
      capacity: 3,
      minAge: 10,
      minHeight: 130,
      isActive: true,
      internalNotes: '運動しやすい服装でお越しください'
    },
    'chanbara': {
      name: 'チャンバラ',
      overview: 'VR空間で刀を振り、敵を倒していくアクションゲームです。時代劇の世界に入り込んだような臨場感あふれる戦闘を体験できます。',
      notes: [
        '周囲に十分なスペースが必要です',
        '腕を振り回す動作がありますので、肩や腕に痛みがある方はご注意ください',
        '刀型コントローラーを使用します',
        '体験時間は約6分です'
      ],
      videoUrl: '',
      duration: 6,
      capacity: 4,
      minAge: 8,
      minHeight: 110,
      isActive: true,
      internalNotes: '刀型コントローラーを使用します'
    }
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const mockReceptions: Reception[] = [
      {
        id: 1,
        receptionNumber: 'A-015',
        booth: 'horse-race',
        nickname: '山田',
        partySize: 2,
        ages: [25, 28],
        status: 'called',
        is_priority_call: false,
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
        calledAt: new Date()
      },
      {
        id: 2,
        receptionNumber: 'A-016',
        booth: 'parkour',
        nickname: '佐藤',
        partySize: 1,
        ages: [22],
        status: 'waiting',
        timestamp: new Date(Date.now() - 1000 * 60 * 3)
      },
      {
        id: 3,
        receptionNumber: 'A-017',
        booth: 'horse-race',
        nickname: '鈴木',
        partySize: 3,
        ages: [35, 12, 8],
        guardianName: '鈴木太郎',
        status: 'pending',
        is_priority_call: true,
        timestamp: new Date(Date.now() - 1000 * 60 * 2)
      },
      {
        id: 4,
        receptionNumber: 'A-018',
        booth: 'chanbara',
        nickname: '田中',
        partySize: 2,
        ages: [19, 20],
        status: 'waiting',
        timestamp: new Date(Date.now() - 1000 * 60 * 1)
      }
    ];
    setReceptions(mockReceptions);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    // TODO: LoginAsStaff RPC を呼ぶ
    if (loginPassword === BOOTH_PASSWORDS[loginBooth]) {
      setIsLoggedIn(true);
      setLoggedInBooth(loginBooth);
    } else {
      setLoginError('パスワードが違います');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoggedInBooth(null);
    setLoginPassword('');
    setLoginError(null);
  };

  const formatDateTime = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const getBoothName = (booth: BoothType) => {
    const names = {
      'horse-race': '馬レース',
      'parkour': 'パルクール',
      'chanbara': 'チャンバラ'
    };
    return names[booth];
  };

  const getStatusName = (status: ReceptionStatus) => {
    const names: Record<ReceptionStatus, string> = {
      'waiting': '待機中',
      'called': '呼出中',
      'admitted': '入場済み',
      'cancelled': 'キャンセル',
      'pending': '保留中'
    };
    return names[status];
  };

  const getStatusColor = (status: ReceptionStatus) => {
    const colors: Record<ReceptionStatus, string> = {
      'waiting': 'bg-blue-100 text-blue-700',
      'called': 'bg-yellow-100 text-yellow-700',
      'admitted': 'bg-green-100 text-green-700',
      'cancelled': 'bg-gray-100 text-gray-700',
      'pending': 'bg-red-100 text-red-700'
    };
    return colors[status];
  };

  const handleStatusChange = (id: number, newStatus: ReceptionStatus) => {
    setReceptions(prev => prev.map(r => {
      if (r.id === id) {
        const updated = { ...r, status: newStatus };
        if (newStatus === 'called') {
          updated.calledAt = new Date();
        } else if (newStatus === 'admitted') {
          updated.admittedAt = new Date();
        }
        return updated;
      }
      return r;
    }));
  };

  const handleCancelTicket = (id: number) => {
    // TODO: CancelTicketByStaff RPC を呼ぶ
    handleStatusChange(id, 'cancelled');
  };

  const menuItems = [
    { id: 'reservations-all' as PageType, label: '予約状況（全体）', icon: '📋' },
    { id: 'reservations-horse' as PageType, label: '馬レース', icon: '🏇' },
    { id: 'reservations-parkour' as PageType, label: 'パルクール', icon: '🤸' },
    { id: 'reservations-chanbara' as PageType, label: 'チャンバラ', icon: '⚔️' },
    { id: 'booth-settings' as PageType, label: 'ブース情報設定', icon: '⚙️' }
  ];

  const handleMenuClick = (pageId: PageType) => {
    setCurrentPage(pageId);
    setIsMenuOpen(false);
  };

  const getCurrentPageTitle = () => {
    const item = menuItems.find(m => m.id === currentPage);
    return item ? item.label : '管理者画面';
  };

  const getBoothTypeFromPage = (): BoothType | null => {
    if (currentPage === 'reservations-horse') return 'horse-race';
    if (currentPage === 'reservations-parkour') return 'parkour';
    if (currentPage === 'reservations-chanbara') return 'chanbara';
    return null;
  };

  const boothType = getBoothTypeFromPage();
  const pageReceptions = boothType ? receptions.filter(r => r.booth === boothType) : receptions;

  const filteredReceptions = (() => {
    let filtered = pageReceptions;
    if (currentPage === 'reservations-all' && selectedBooth !== 'all') {
      filtered = filtered.filter(r => r.booth === selectedBooth);
    }
    if (searchNumber !== '') {
      filtered = filtered.filter(r => r.receptionNumber.toLowerCase().includes(searchNumber.toLowerCase()));
    }
    return filtered;
  })();

  // 優先呼び出し（pendingから戻ってきた来場者）
  const priorityReceptions = filteredReceptions.filter(r => r.is_priority_call && r.status !== 'admitted' && r.status !== 'cancelled');
  const normalReceptions = filteredReceptions.filter(r => !r.is_priority_call || r.status === 'admitted' || r.status === 'cancelled');

  const waitingCount = pageReceptions.filter(r => r.status === 'waiting').length;
  const calledCount = pageReceptions.filter(r => r.status === 'called').length;
  const admittedCount = pageReceptions.filter(r => r.status === 'admitted').length;

  const handleCallNext = () => {
    const waitingReceptions = pageReceptions.filter(r => r.status === 'waiting');
    if (waitingReceptions.length > 0) {
      handleStatusChange(waitingReceptions[0].id, 'called');
    }
  };

  // ログイン画面
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🛡️</div>
            <h1 className="text-2xl font-bold text-gray-800">スタッフログイン</h1>
            <p className="text-sm text-gray-500 mt-2">担当ブースとパスワードを入力してください</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">担当ブース</label>
              <select
                value={loginBooth}
                onChange={(e) => setLoginBooth(e.target.value as BoothType)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-[#D4B946] text-base"
              >
                <option value="horse-race">🏇 馬レース</option>
                <option value="parkour">🤸 パルクール</option>
                <option value="chanbara">⚔️ チャンバラ</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">共有パスワード</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="パスワードを入力"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-[#D4B946] text-base"
              />
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 text-center">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-[#D4B946] text-white font-bold rounded-xl hover:bg-[#B89D3A] transition-colors text-base"
            >
              ログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 管理画面本体
  return (
    <div className="min-h-screen bg-gray-50">
      {/* サイドメニュー */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-gray-800">メニュー</h2>
            <button
              onClick={() => setIsMenuOpen(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav className="space-y-2">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.id)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                  currentPage === item.id
                    ? 'bg-[#D4B946] text-white font-bold'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 text-gray-700 flex items-center gap-3"
            >
              <span className="text-xl">🚪</span>
              <span>ログアウト</span>
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* ヘッダー */}
      <header className="bg-[#D4B946] shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 hover:bg-[#B89D3A] rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 className="text-[24px] font-bold text-white">{getCurrentPageTitle()}</h1>
                {loggedInBooth && (
                  <div className="text-xs text-yellow-100">{getBoothName(loggedInBooth)} 担当</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-white text-[14px]">{formatDateTime(currentDateTime)}</div>
              <button
                onClick={handleLogout}
                className="px-3 py-1 bg-[#B89D3A] text-white text-sm font-bold rounded-lg hover:bg-[#9A7E2A] transition-colors"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {currentPage === 'booth-settings' ? (
          /* ブース情報設定ページ */
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex gap-2">
                {(Object.keys(boothSettings) as BoothType[]).map(booth => {
                  const settings = boothSettings[booth];
                  return (
                    <button
                      key={booth}
                      onClick={() => setSelectedBoothTab(booth)}
                      className={`flex-1 px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
                        selectedBoothTab === booth
                          ? 'bg-[#D4B946] text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <span className="text-xl">
                        {booth === 'horse-race' ? '🏇' : booth === 'parkour' ? '🤸' : '⚔️'}
                      </span>
                      <span>{settings.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {(() => {
              const booth = selectedBoothTab;
              const settings = boothSettings[booth];

              const updateSettings = (updates: Partial<BoothSettings>) => {
                setBoothSettings(prev => ({
                  ...prev,
                  [booth]: { ...prev[booth], ...updates }
                }));
              };

              const updateNote = (index: number, value: string) => {
                const newNotes = [...settings.notes];
                newNotes[index] = value;
                updateSettings({ notes: newNotes });
              };

              const addNote = () => {
                updateSettings({ notes: [...settings.notes, ''] });
              };

              const removeNote = (index: number) => {
                const newNotes = settings.notes.filter((_, i) => i !== index);
                updateSettings({ notes: newNotes });
              };

              return (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                    <span className="text-3xl">
                      {booth === 'horse-race' ? '🏇' : booth === 'parkour' ? '🤸' : '⚔️'}
                    </span>
                    {settings.name}の設定
                  </h2>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">ブース名</label>
                      <input
                        type="text"
                        value={settings.name}
                        onChange={(e) => updateSettings({ name: e.target.value })}
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">概要（ユーザー画面に表示）</label>
                      <textarea
                        value={settings.overview}
                        onChange={(e) => updateSettings({ overview: e.target.value })}
                        rows={4}
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-bold text-gray-700">注意事項（ユーザー画面に表示）</label>
                        <button
                          onClick={addNote}
                          className="px-3 py-1 bg-green-500 text-white text-sm font-bold rounded hover:bg-green-600 transition-colors"
                        >
                          + 追加
                        </button>
                      </div>
                      <div className="space-y-2">
                        {settings.notes.map((note, index) => (
                          <div key={index} className="flex gap-2">
                            <input
                              type="text"
                              value={note}
                              onChange={(e) => updateNote(index, e.target.value)}
                              placeholder={`注意事項 ${index + 1}`}
                              className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
                            />
                            <button
                              onClick={() => removeNote(index)}
                              className="px-3 py-2 bg-red-500 text-white font-bold rounded hover:bg-red-600 transition-colors"
                            >
                              削除
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">説明動画URL</label>
                      <input
                        type="url"
                        value={settings.videoUrl}
                        onChange={(e) => updateSettings({ videoUrl: e.target.value })}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
                      />
                    </div>

                    <div className="border-t-2 border-gray-200 pt-6">
                      <h3 className="text-lg font-bold text-gray-800 mb-4">運用設定</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">体験時間（分）</label>
                        <input
                          type="number"
                          value={settings.duration}
                          onChange={(e) => updateSettings({ duration: parseInt(e.target.value) || 0 })}
                          min="1"
                          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">同時体験可能人数</label>
                        <input
                          type="number"
                          value={settings.capacity}
                          onChange={(e) => updateSettings({ capacity: parseInt(e.target.value) || 0 })}
                          min="1"
                          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">最低年齢</label>
                        <input
                          type="number"
                          value={settings.minAge}
                          onChange={(e) => updateSettings({ minAge: parseInt(e.target.value) || 0 })}
                          min="0"
                          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">最低身長（cm）</label>
                        <input
                          type="number"
                          value={settings.minHeight}
                          onChange={(e) => updateSettings({ minHeight: parseInt(e.target.value) || 0 })}
                          min="0"
                          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">稼働状態</label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.isActive}
                          onChange={(e) => updateSettings({ isActive: e.target.checked })}
                          className="w-6 h-6 border-2 border-gray-300 rounded accent-[#D4B946] cursor-pointer"
                        />
                        <span className={`text-sm font-medium ${settings.isActive ? 'text-green-600' : 'text-red-600'}`}>
                          {settings.isActive ? '稼働中' : '停止中'}
                        </span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">内部メモ（スタッフ用）</label>
                      <textarea
                        value={settings.internalNotes}
                        onChange={(e) => updateSettings({ internalNotes: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-center">
              <button
                onClick={() => alert('設定を保存しました')}
                className="px-8 py-3 bg-[#D4B946] text-white font-bold rounded-lg hover:bg-[#B89D3A] transition-colors text-lg"
              >
                設定を保存
              </button>
            </div>
          </div>
        ) : (
          /* 予約状況ページ */
          <>
            {/* 統計カード */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-4">
                <div className="text-sm text-gray-600 mb-1">待機中</div>
                <div className="text-3xl font-bold text-blue-600">{waitingCount}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="text-sm text-gray-600 mb-1">呼出中</div>
                <div className="text-3xl font-bold text-yellow-600">{calledCount}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="text-sm text-gray-600 mb-1">入場済み</div>
                <div className="text-3xl font-bold text-green-600">{admittedCount}</div>
              </div>
            </div>

            {/* コントロールエリア */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex flex-wrap gap-4 items-end">
                {currentPage === 'reservations-all' && (
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-bold text-gray-700 mb-2">ブースで絞り込み</label>
                    <select
                      value={selectedBooth}
                      onChange={(e) => setSelectedBooth(e.target.value as BoothType | 'all')}
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
                    >
                      <option value="all">すべて</option>
                      <option value="horse-race">馬レース</option>
                      <option value="parkour">パルクール</option>
                      <option value="chanbara">チャンバラ</option>
                    </select>
                  </div>
                )}

                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-bold text-gray-700 mb-2">受付番号で検索</label>
                  <input
                    type="text"
                    value={searchNumber}
                    onChange={(e) => setSearchNumber(e.target.value)}
                    placeholder="A-105"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
                  />
                </div>

                <div>
                  <button
                    onClick={handleCallNext}
                    disabled={waitingCount === 0}
                    className="px-6 py-2 bg-[#D4B946] text-white font-bold rounded-lg hover:bg-[#B89D3A] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    次を呼び出す
                  </button>
                </div>
              </div>
            </div>

            {/* 優先呼び出しセクション */}
            {priorityReceptions.length > 0 && (
              <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">⭐</span>
                  <h3 className="font-bold text-amber-800 text-lg">優先呼び出し</h3>
                  <span className="text-sm text-amber-600">（一度保留になった来場者）</span>
                </div>
                <div className="space-y-2">
                  {priorityReceptions.map((reception) => (
                    <div key={reception.id} className="bg-amber-100 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-bold text-amber-900">{reception.receptionNumber}</span>
                        <span className="text-sm font-medium text-gray-800">{reception.nickname}</span>
                        <span className="text-sm text-gray-600">{reception.partySize}名</span>
                        {currentPage === 'reservations-all' && (
                          <span className="text-xs text-gray-500">{getBoothName(reception.booth)}</span>
                        )}
                        <span className={`inline-block px-2 py-1 text-xs font-bold rounded-full ${getStatusColor(reception.status)}`}>
                          {getStatusName(reception.status)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {reception.status === 'pending' && (
                          <button
                            onClick={() => handleStatusChange(reception.id, 'called')}
                            className="px-3 py-1 bg-amber-500 text-white text-sm font-bold rounded hover:bg-amber-600 transition-colors"
                          >
                            呼び出す
                          </button>
                        )}
                        {reception.status === 'called' && (
                          <button
                            onClick={() => handleStatusChange(reception.id, 'admitted')}
                            className="px-3 py-1 bg-green-500 text-white text-sm font-bold rounded hover:bg-green-600 transition-colors"
                          >
                            入場処理
                          </button>
                        )}
                        <button
                          onClick={() => handleCancelTicket(reception.id)}
                          className="px-3 py-1 bg-gray-400 text-white text-sm font-bold rounded hover:bg-gray-500 transition-colors"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 受付一覧テーブル */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">受付番号</th>
                      {currentPage === 'reservations-all' && (
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">ブース</th>
                      )}
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">ニックネーム</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">人数</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">年齢</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">受付時刻</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">状態</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {normalReceptions.map((reception) => (
                      <tr key={reception.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="text-lg font-bold text-[#5A4A20]">
                            {reception.receptionNumber}
                          </span>
                        </td>
                        {currentPage === 'reservations-all' && (
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-900">{getBoothName(reception.booth)}</span>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-gray-900">{reception.nickname}</span>
                          {reception.guardianName && (
                            <div className="text-xs text-gray-500">保護者: {reception.guardianName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-900">{reception.partySize}名</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-900">{reception.ages.join(', ')}歳</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-900">{formatTime(reception.timestamp)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(reception.status)}`}>
                            {getStatusName(reception.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <select
                              value={reception.status}
                              onChange={(e) => handleStatusChange(reception.id, e.target.value as ReceptionStatus)}
                              className="text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-[#D4B946]"
                            >
                              <option value="waiting">待機中</option>
                              <option value="called">呼出中</option>
                              <option value="admitted">入場済み</option>
                              <option value="pending">保留中</option>
                              <option value="cancelled">キャンセル</option>
                            </select>
                            <button
                              onClick={() => handleCancelTicket(reception.id)}
                              className="px-2 py-1 bg-gray-200 text-gray-600 text-xs font-bold rounded hover:bg-gray-300 transition-colors"
                              title="キャンセル"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {normalReceptions.length === 0 && priorityReceptions.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  該当する受付がありません
                </div>
              )}
            </div>

            <div className="mt-6 text-center text-sm text-gray-500">
              全 {filteredReceptions.length} 件の受付
            </div>
          </>
        )}
      </div>
    </div>
  );
}
