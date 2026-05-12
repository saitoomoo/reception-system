'use client';

import { useState } from 'react';
import { adminClient } from '@/lib/connect/client';

export default function GlobalResetScreen() {
  const [step, setStep] = useState<'idle' | 'confirm-dialog' | 'confirm-token'>('idle');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    if (token !== 'RESET') {
      setError('確認テキストが正しくありません。"RESET" と入力してください。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await adminClient.resetEventData({ confirmationToken: 'RESET' });
      setDone(true);
      setStep('idle');
      setToken('');
      alert(res.message || 'イベントデータをリセットしました。');
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(`リセットに失敗しました: ${e.message}`);
      } else {
        setError('リセットに失敗しました。');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gray-800 text-white py-4 px-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">データリセット</h1>
        <a href="/admin/global/dashboard" className="text-sm text-gray-300 hover:text-white">
          ← ダッシュボードへ
        </a>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        {done && (
          <div className="bg-green-50 border border-green-300 text-green-800 rounded-lg p-4 mb-6 text-sm">
            イベントデータのリセットが完了しました。
          </div>
        )}

        <div className="bg-red-50 border-2 border-red-400 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-700 mb-2">⚠ 危険な操作</h2>
          <p className="text-sm text-red-700 mb-4">
            この操作を実行すると、以下のデータが<strong>完全に削除</strong>されます。
            <strong>元に戻すことはできません。</strong>
          </p>
          <ul className="text-sm text-red-700 mb-4 list-disc list-inside space-y-1">
            <li>全来場者データ（受付番号・PIN・ニックネーム）</li>
            <li>全整理券・参加者・保護者同意データ</li>
            <li>全入場処理・通知ログ・マッチセッション</li>
            <li>全Push購読情報</li>
          </ul>
          <p className="text-sm text-gray-700 mb-4">
            ブース設定・管理者アカウント・通知テンプレートは保持されます。
          </p>

          {step === 'idle' && (
            <button
              onClick={() => setStep('confirm-dialog')}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2 rounded"
            >
              イベントデータをリセットする
            </button>
          )}
        </div>
      </div>

      {step === 'confirm-dialog' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-red-700 mb-2">本当に実行しますか？</h2>
            <p className="text-sm text-gray-600 mb-4">
              全来場者・整理券データが削除されます。イベント後の集計を済ませてから実行してください。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setStep('idle')}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                キャンセル
              </button>
              <button
                onClick={() => setStep('confirm-token')}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded"
              >
                続ける
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'confirm-token' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-red-700 mb-2">確認テキストを入力</h2>
            <p className="text-sm text-gray-600 mb-3">
              続行するには <code className="bg-gray-100 px-1 rounded font-mono">RESET</code> と入力してください。
            </p>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="RESET"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono mb-3 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            {error && (
              <p className="text-sm text-red-600 mb-3">{error}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setStep('idle'); setToken(''); setError(null); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleReset}
                disabled={loading || token !== 'RESET'}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-semibold px-4 py-2 rounded"
              >
                {loading ? '実行中...' : 'リセット実行'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
