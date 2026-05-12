import { useEffect, useRef, useState } from 'react';
import { staffClient, adminClient } from '@/lib/connect/client';

type Participant = {
  name: string;
  age: string;
};

type Props = {
  onClose?: () => void;
};

export default function ManualIssue({ onClose }: Props) {
  const [receptionNumber, setReceptionNumber] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([{ name: '', age: '' }]);
  const [guardianName, setGuardianName] = useState('');
  const [paperFormId, setPaperFormId] = useState('');
  const [riskText, setRiskText] = useState('');
  const [riskLoaded, setRiskLoaded] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ ticketId: string; sequence: number } | null>(null);
  const riskRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    adminClient.getRiskExplanation({})
      .then((res) => { setRiskText(res.body); setRiskLoaded(true); })
      .catch(() => setRiskText('リスク説明文の取得に失敗しました。'));
  }, []);

  const ages = participants.map((p) => parseInt(p.age, 10)).filter((a) => !isNaN(a));
  const hasUnder7 = ages.some((a) => a < 7);
  const hasUnder10 = ages.some((a) => a < 10 && a >= 7);
  const hasUnder13 = ages.some((a) => a < 13);

  const handleScroll = () => {
    const el = riskRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
      setScrolledToEnd(true);
    }
  };

  const addParticipant = () => {
    setParticipants((prev) => [...prev, { name: '', age: '' }]);
  };

  const updateParticipant = (i: number, field: keyof Participant, value: string) => {
    setParticipants((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };

  const removeParticipant = (i: number) => {
    if (participants.length === 1) return;
    setParticipants((prev) => prev.filter((_, idx) => idx !== i));
  };

  const canSubmit = () => {
    if (!receptionNumber.trim()) return false;
    if (participants.some((p) => !p.name.trim() || !p.age.trim())) return false;
    if (hasUnder7) return false;
    if (hasUnder10 && !paperFormId.trim()) return false;
    if (hasUnder13 && (!guardianName.trim() || !consentChecked)) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await staffClient.createTicketManual({
        receptionNumber: receptionNumber.trim().toUpperCase(),
        participants: participants.map((p) => ({
          name: p.name.trim(),
          age: parseInt(p.age, 10),
        })),
        guardianName: hasUnder13 ? guardianName.trim() : '',
        paperFormId: hasUnder10 ? paperFormId.trim() : '',
        consentTextSnapshot: hasUnder13 ? riskText : '',
      });
      setSuccess({ ticketId: res.ticketId, sequence: res.sequenceInBooth });
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(`エラー: ${e.message}`);
      } else {
        setError('整理券の発行に失敗しました。');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6 text-center space-y-4">
        <div className="text-4xl">✅</div>
        <h2 className="text-xl font-bold text-green-700">整理券を発行しました</h2>
        <p className="text-sm text-gray-600">
          整理券 No. <span className="font-bold font-mono">#{success.sequence}</span> を発行しました。
        </p>
        <button
          onClick={() => {
            setSuccess(null);
            setReceptionNumber('');
            setParticipants([{ name: '', age: '' }]);
            setGuardianName('');
            setPaperFormId('');
            setConsentChecked(false);
            setScrolledToEnd(false);
          }}
          className="w-full py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
        >
          次の発行へ
        </button>
        {onClose && (
          <button onClick={onClose} className="w-full py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300">
            閉じる
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg shadow p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">特殊フロー手動発行</h2>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">
        7〜9歳の参加者がいる場合のスタッフ介在フローです。紙の同意書を保護者に記入してもらってから操作してください。
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">来場者の受付番号</label>
          <input
            type="text"
            value={receptionNumber}
            onChange={(e) => setReceptionNumber(e.target.value.toUpperCase())}
            placeholder="A-105"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-semibold text-gray-700">参加者</label>
            <button type="button" onClick={addParticipant} className="text-xs text-blue-600 hover:text-blue-800">
              + 追加
            </button>
          </div>
          <div className="space-y-2">
            {participants.map((p, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => updateParticipant(i, 'name', e.target.value)}
                  placeholder="氏名"
                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <input
                  type="number"
                  value={p.age}
                  onChange={(e) => updateParticipant(i, 'age', e.target.value)}
                  placeholder="年齢"
                  min="0"
                  max="120"
                  className="w-20 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {participants.length > 1 && (
                  <button type="button" onClick={() => removeParticipant(i)} className="text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {hasUnder7 && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded p-3 text-sm font-semibold">
            7歳未満の参加者は受付できません。
          </div>
        )}

        {hasUnder10 && !hasUnder7 && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              紙の同意書 管理ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={paperFormId}
              onChange={(e) => setPaperFormId(e.target.value)}
              placeholder="P-0042"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        )}

        {hasUnder13 && !hasUnder7 && (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                保護者氏名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                リスク説明文 <span className="text-xs text-gray-500 font-normal">（保護者に読んでもらってください）</span>
              </label>
              <div
                ref={riskRef}
                onScroll={handleScroll}
                className="border border-gray-300 rounded h-40 overflow-y-auto p-3 text-sm text-gray-700 bg-gray-50 whitespace-pre-wrap"
              >
                {riskLoaded ? riskText : '読み込み中...'}
              </div>
              {!scrolledToEnd && (
                <p className="text-xs text-amber-600 mt-1">↓ スクロールして末尾まで確認してください</p>
              )}
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                disabled={!scrolledToEnd}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 h-4 w-4 accent-blue-600 disabled:opacity-40"
              />
              <span className={`text-sm ${scrolledToEnd ? 'text-gray-700' : 'text-gray-400'}`}>
                保護者が上記リスク説明文を確認し、同意しました
              </span>
            </label>
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded p-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !canSubmit()}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors"
        >
          {loading ? '発行中...' : '整理券を発行'}
        </button>
      </form>
    </div>
  );
}
