import { useState } from 'react';
import { staffClient } from '@/lib/connect/client';
import { AdmitOutcome } from '@/gen/ts/admin/v1/admin_pb';

type ResultDisplay = {
  type: 'success' | 'warning' | 'info' | 'error';
  message: string;
};

export default function ManualAdmit() {
  const [receptionNumber, setReceptionNumber] = useState('');
  const [result, setResult] = useState<ResultDisplay | null>(null);
  const [confirmForce, setConfirmForce] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent, force = false) => {
    e.preventDefault();
    if (!receptionNumber.trim()) return;
    setResult(null);
    setConfirmForce(false);
    setLoading(true);
    try {
      const res = await staffClient.admitManually({ receptionNumber: receptionNumber.trim(), force });
      switch (res.outcome) {
        case AdmitOutcome.ADMITTED:
          setResult({ type: 'success', message: '入場処理が完了しました' });
          setReceptionNumber('');
          break;
        case AdmitOutcome.RESTORED_TO_PRIORITY_CALL:
          setResult({ type: 'warning', message: '保留中だったため、優先呼び出しに戻しました' });
          break;
        case AdmitOutcome.WAITING_CONFIRMATION_NEEDED:
          setResult({ type: 'warning', message: '待機中の整理券です。強制入場しますか？' });
          setConfirmForce(true);
          break;
        case AdmitOutcome.ALREADY_ADMITTED:
          setResult({ type: 'info', message: '既に入場済みです' });
          break;
        case AdmitOutcome.NOT_FOUND:
          setResult({ type: 'error', message: 'このブースの整理券が見つかりません' });
          break;
        default:
          setResult({ type: 'error', message: '不明な結果です' });
      }
    } catch {
      setResult({ type: 'error', message: 'エラーが発生しました。もう一度試してください' });
    } finally {
      setLoading(false);
    }
  };

  const resultColors = {
    success: 'bg-green-50 border-green-400 text-green-800',
    warning: 'bg-amber-50 border-amber-400 text-amber-800',
    info: 'bg-gray-50 border-gray-400 text-gray-700',
    error: 'bg-red-50 border-red-400 text-red-800',
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">手動入場処理</h2>
        <p className="text-sm text-gray-500 mb-6 text-center">
          QRコードが読めない場合、受付番号を手入力して入場処理を行います
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">受付番号</label>
            <input
              type="text"
              value={receptionNumber}
              onChange={(e) => setReceptionNumber(e.target.value.toUpperCase())}
              placeholder="A-105"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-[#D4B946] text-base font-mono"
            />
          </div>

          {result && (
            <div className={`border-2 rounded-lg p-4 ${resultColors[result.type]}`}>
              <div className="font-bold">{result.message}</div>
              {confirmForce && (
                <div className="flex gap-3 mt-3">
                  <button
                    type="button"
                    onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
                    disabled={loading}
                    className="flex-1 py-2 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 transition-colors text-sm"
                  >
                    強制入場する
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConfirmForce(false); setResult(null); }}
                    className="flex-1 py-2 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition-colors text-sm"
                  >
                    キャンセル
                  </button>
                </div>
              )}
            </div>
          )}

          {!confirmForce && (
            <button
              type="submit"
              disabled={loading || !receptionNumber.trim()}
              className="w-full py-3 bg-[#D4B946] text-white font-bold rounded-xl hover:bg-[#B89D3A] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? '処理中...' : '入場処理する'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
