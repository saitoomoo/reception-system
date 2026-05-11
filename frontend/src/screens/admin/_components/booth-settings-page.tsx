import { useState } from 'react';
import { BoothType, BoothSettings, BOOTH_ICONS } from '../types';

const INITIAL_SETTINGS: Record<BoothType, BoothSettings> = {
  'horse-race': {
    name: '馬レース',
    overview:
      'VRゴーグルを装着し、仮想空間で馬に乗ってレースを楽しむ体験です。リアルな馬の動きと迫力あるコースで、実際に馬に乗っているような感覚を味わえます。',
    notes: [
      '身長120cm以上の方が対象です',
      '妊娠中の方、心臓疾患をお持ちの方はご利用いただけません',
      '酔いやすい方はご注意ください',
      '体験時間は約5分です',
    ],
    videoUrl: '',
    duration: 5,
    capacity: 4,
    minAge: 6,
    minHeight: 120,
    isActive: true,
    internalNotes: 'VRゴーグルを使用します',
  },
  parkour: {
    name: 'パルクール',
    overview:
      '障害物を乗り越えたり、壁を登ったりするパルクールの動きをVR空間で体験できます。安全な環境で自由に街を駆け抜ける爽快感を味わえます。',
    notes: [
      '運動しやすい服装でお越しください',
      '裸足での体験となります',
      '激しい動きを伴いますので、体調の優れない方はご遠慮ください',
      '体験時間は約7分です',
    ],
    videoUrl: '',
    duration: 7,
    capacity: 3,
    minAge: 10,
    minHeight: 130,
    isActive: true,
    internalNotes: '運動しやすい服装でお越しください',
  },
  chanbara: {
    name: 'チャンバラ',
    overview:
      'VR空間で刀を振り、敵を倒していくアクションゲームです。時代劇の世界に入り込んだような臨場感あふれる戦闘を体験できます。',
    notes: [
      '周囲に十分なスペースが必要です',
      '腕を振り回す動作がありますので、肩や腕に痛みがある方はご注意ください',
      '刀型コントローラーを使用します',
      '体験時間は約6分です',
    ],
    videoUrl: '',
    duration: 6,
    capacity: 4,
    minAge: 8,
    minHeight: 110,
    isActive: true,
    internalNotes: '刀型コントローラーを使用します',
  },
};

export default function BoothSettingsPage() {
  const [selectedBoothTab, setSelectedBoothTab] = useState<BoothType>('horse-race');
  const [boothSettings, setBoothSettings] = useState<Record<BoothType, BoothSettings>>(INITIAL_SETTINGS);

  const settings = boothSettings[selectedBoothTab];

  const updateSettings = (updates: Partial<BoothSettings>) => {
    setBoothSettings((prev) => ({
      ...prev,
      [selectedBoothTab]: { ...prev[selectedBoothTab], ...updates },
    }));
  };

  const updateNote = (index: number, value: string) => {
    const newNotes = [...settings.notes];
    newNotes[index] = value;
    updateSettings({ notes: newNotes });
  };

  const addNote = () => updateSettings({ notes: [...settings.notes, ''] });

  const removeNote = (index: number) => {
    updateSettings({ notes: settings.notes.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      {/* ブースタブ */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex gap-2">
          {(Object.keys(boothSettings) as BoothType[]).map((booth) => (
            <button
              key={booth}
              onClick={() => setSelectedBoothTab(booth)}
              className={`flex-1 px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
                selectedBoothTab === booth
                  ? 'bg-[#D4B946] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-xl">{BOOTH_ICONS[booth]}</span>
              <span>{boothSettings[booth].name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 設定フォーム */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
          <span className="text-3xl">{BOOTH_ICONS[selectedBoothTab]}</span>
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

      <div className="flex justify-center">
        <button
          onClick={() => alert('設定を保存しました')}
          className="px-8 py-3 bg-[#D4B946] text-white font-bold rounded-lg hover:bg-[#B89D3A] transition-colors text-lg"
        >
          設定を保存
        </button>
      </div>
    </div>
  );
}
