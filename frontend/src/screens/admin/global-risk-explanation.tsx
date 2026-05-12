import { useEffect, useState } from 'react';
import { adminClient } from '@/lib/connect/client';

export default function GlobalRiskExplanationScreen() {
  const [body, setBody] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    adminClient.getRiskExplanation({})
      .then((res) => {
        setBody(res.body);
        if (res.updatedAt) setUpdatedAt(res.updatedAt);
      })
      .catch(() => setError('読み込みに失敗しました。管理者セッションが切れている可能性があります。'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!body.trim()) return;
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const res = await adminClient.updateRiskExplanation({ body });
      if (res.updatedAt) setUpdatedAt(res.updatedAt);
      setSuccess(true);
    } catch {
      setError('保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gray-800 text-white py-4 px-6 flex items-center gap-4">
        <a href="/admin/global/dashboard" className="text-gray-300 hover:text-white text-sm">← ダッシュボード</a>
        <h1 className="text-xl font-bold">リスク説明文編集</h1>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-4 flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-300 text-green-700 rounded-lg p-4">
            保存しました。
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              リスク説明文
            </label>
            <p className="text-xs text-gray-500 mb-3">
              13歳未満の参加者がいる場合に保護者が読む説明文です。保護者がスクロールして末尾まで確認しないと同意ボタンが押せません。
            </p>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 h-64 resize-y"
              value={body}
              onChange={(e) => { setBody(e.target.value); setSuccess(false); }}
              placeholder="HMD体験に関するリスク説明文を入力してください..."
            />
          </div>
          {updatedAt && (
            <p className="text-xs text-gray-400">
              最終更新: {new Date(updatedAt).toLocaleString('ja-JP')}
            </p>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !body.trim()}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
