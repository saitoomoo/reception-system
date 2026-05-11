interface Props {
  guardianName: string;
  guardianConsent: boolean;
  hasScrolledConsent: boolean;
  onGuardianNameChange: (v: string) => void;
  onGuardianConsentChange: (checked: boolean) => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}

export default function ConsentStep({
  guardianName, guardianConsent, hasScrolledConsent,
  onGuardianNameChange, onGuardianConsentChange, onScroll, onSubmit, onBack,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
          onScroll={onScroll}
        >
          <p className="text-[14px] text-[#5A4A20] leading-relaxed">
            <span className="block">私は、下記の未成年者の保護者として、本体験プログラムへの参加に同意いたします。</span>
            <span className="block font-bold mt-4">【同意事項】</span>
            <span className="block mt-2">1. 体験中の安全管理について、施設の指示に従うことを承諾します。</span>
            <span className="block mt-2">2. 体験中に発生した事故・怪我について、施設の過失によらない場合は自己責任とすることを理解します。</span>
            <span className="block mt-2">3. VR機器（HMD）の使用に際し、目の疲労・VR酔い・転倒等のリスクがあることを理解します。</span>
            <span className="block mt-2">4. 緊急時の連絡先を正確に記入し、必要に応じて対応することを承諾します。</span>
            <span className="block mt-2">5. 体験の様子を撮影した写真・動画が、施設の広報活動に使用される可能性があることを承諾します。</span>
            <span className="block font-bold mt-4">【注意事項】</span>
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
            onChange={(e) => onGuardianNameChange(e.target.value)}
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
              onChange={(e) => hasScrolledConsent && onGuardianConsentChange(e.target.checked)}
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
  );
}
