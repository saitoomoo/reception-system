interface Props {
  nickname: string;
  partySize: string;
  pin: string;
  pinConfirm: string;
  pinError: string | null;
  maxPartySize?: number;
  onNicknameChange: (v: string) => void;
  onPartySizeChange: (v: string) => void;
  onPinChange: (v: string) => void;
  onPinConfirmChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}

export default function InputStep({
  nickname, partySize, pin, pinConfirm, pinError, maxPartySize,
  onNicknameChange, onPartySizeChange, onPinChange, onPinConfirmChange,
  onSubmit, onBack,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
        <label className="block text-[18px] font-bold text-[#5A4A20] mb-3">代表者ニックネーム</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => onNicknameChange(e.target.value)}
          placeholder="例：山田"
          required
          className="w-full px-4 py-4 text-[20px] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
        />
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
        <label className="block text-[18px] font-bold text-[#5A4A20] mb-3">体験人数</label>
        <input
          type="number"
          value={partySize}
          onChange={(e) => onPartySizeChange(e.target.value)}
          placeholder="例：2"
          min="1"
          max={maxPartySize}
          required
          className="w-full px-4 py-4 text-[20px] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
        />
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
        <label className="block text-[18px] font-bold text-[#5A4A20] mb-3">4桁のPIN</label>
        <input
          type="tel"
          value={pin}
          onChange={(e) => /^\d{0,4}$/.test(e.target.value) && onPinChange(e.target.value)}
          placeholder="0000"
          maxLength={4}
          required
          pattern="\d{4}"
          inputMode="numeric"
          className="w-full px-4 py-4 text-[20px] text-center tracking-[0.5em] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
        />
        <p className="mt-2 text-[14px] text-[#5A4A20] opacity-70">※ 再ログイン時に使用します。忘れないようにしてください</p>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
        <label className="block text-[18px] font-bold text-[#5A4A20] mb-3">4桁のPIN（確認）</label>
        <input
          type="tel"
          value={pinConfirm}
          onChange={(e) => /^\d{0,4}$/.test(e.target.value) && onPinConfirmChange(e.target.value)}
          placeholder="0000"
          maxLength={4}
          required
          pattern="\d{4}"
          inputMode="numeric"
          className="w-full px-4 py-4 text-[20px] text-center tracking-[0.5em] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
        />
        <p className="mt-2 text-[14px] text-[#5A4A20] opacity-70">※ もう一度同じPINを入力してください</p>
      </div>

      {pinError && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4">
          <p className="text-[15px] text-red-700 font-bold text-center">{pinError}</p>
        </div>
      )}

      <button type="submit" className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150">
        <span className="text-[28px] font-bold text-[#5A4A20]">次へ</span>
      </button>
    </form>
  );
}
