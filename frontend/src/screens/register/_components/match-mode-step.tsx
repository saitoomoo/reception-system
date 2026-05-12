interface Props {
  allowPrivateMatch: boolean;
  onSelect: (mode: 'public' | 'private') => void;
}

export default function MatchModeStep({ allowPrivateMatch, onSelect }: Props) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
        <p className="text-[16px] text-[#5A4A20] leading-relaxed">
          参加方法を選んでください。
        </p>
      </div>

      <button
        type="button"
        onClick={() => onSelect('public')}
        className="w-full bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150 text-left"
      >
        <p className="text-[20px] font-bold text-[#5A4A20] mb-2">マッチメイキング</p>
        <p className="text-[14px] text-[#5A4A20] opacity-70">他のグループと合わせて体験します</p>
      </button>

      {allowPrivateMatch && (
        <button
          type="button"
          onClick={() => onSelect('private')}
          className="w-full bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-[0.98] transition-all duration-150 text-left"
        >
          <p className="text-[20px] font-bold text-[#5A4A20] mb-2">プライベートマッチ</p>
          <p className="text-[14px] text-[#5A4A20] opacity-70">自分たちのグループだけで体験します</p>
        </button>
      )}
    </div>
  );
}
