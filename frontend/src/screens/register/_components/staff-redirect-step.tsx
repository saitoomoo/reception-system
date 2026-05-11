interface Props {
  onBack: () => void;
}

export default function StaffRedirectStep({ onBack }: Props) {
  return (
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
  );
}
