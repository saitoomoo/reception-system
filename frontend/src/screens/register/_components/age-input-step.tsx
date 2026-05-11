interface Props {
  ages: string[];
  ageError: string | null;
  onAgeChange: (index: number, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}

export default function AgeInputStep({ ages, ageError, onAgeChange, onSubmit, onBack }: Props) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
            onChange={(e) => {
              if (/^\d{0,3}$/.test(e.target.value)) onAgeChange(index, e.target.value);
            }}
            placeholder="年齢を入力"
            min="0"
            max="150"
            required
            className="w-full px-4 py-4 text-[20px] border-2 border-[#D4B946] rounded-xl focus:outline-none focus:border-[#B89D3A] transition-colors"
          />
        </div>
      ))}

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

      <button type="submit" className="w-full bg-white py-6 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150">
        <span className="text-[28px] font-bold text-[#5A4A20]">次へ</span>
      </button>
    </form>
  );
}
