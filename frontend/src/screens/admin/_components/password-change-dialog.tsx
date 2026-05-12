import { useState } from 'react';

type Props = {
  boothName: string;
  onSubmit: (newPassword: string) => Promise<void>;
  onClose: () => void;
};

export default function PasswordChangeDialog({ boothName, onSubmit, onClose }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password) { setError('パスワードを入力してください'); return; }
    if (password !== confirm) { setError('パスワードが一致しません'); return; }
    setSubmitting(true);
    try {
      await onSubmit(password);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '変更に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1">スタッフパスワード変更</h2>
        <p className="text-sm text-gray-500 mb-4">{boothName}</p>

        {error && <div className="bg-red-50 border border-red-300 text-red-700 rounded p-3 text-sm mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">新しいパスワード</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">確認</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">
              キャンセル
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {submitting ? '変更中...' : '変更する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
