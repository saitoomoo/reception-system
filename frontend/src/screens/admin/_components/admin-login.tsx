import { useEffect, useState } from 'react';
import { boothClient, staffClient } from '@/lib/connect/client';
import type { BoothSummary } from '@/gen/ts/booth/v1/booth_pb';

interface Props {
  onLogin: (boothId: string, boothName: string) => void;
}

export default function AdminLogin({ onLogin }: Props) {
  const [booths, setBooths] = useState<BoothSummary[]>([]);
  const [selectedBoothId, setSelectedBoothId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    boothClient.listBooths({}).then((res) => {
      setBooths(res.booths);
      if (res.booths.length > 0) setSelectedBoothId(res.booths[0].id);
    }).catch(() => {
      setError('ブース情報の取得に失敗しました');
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await staffClient.loginAsStaff({ boothId: selectedBoothId, password });
      onLogin(res.boothId, res.boothName);
    } catch {
      setError('パスワードが違います');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🛡️</div>
          <h1 className="text-2xl font-bold text-gray-800">スタッフログイン</h1>
          <p className="text-sm text-gray-500 mt-2">担当ブースとパスワードを入力してください</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">担当ブース</label>
            <select
              value={selectedBoothId}
              onChange={(e) => setSelectedBoothId(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-[#D4B946] text-base"
            >
              {booths.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">共有パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワードを入力"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-[#D4B946] text-base"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !selectedBoothId}
            className="w-full py-3 bg-[#D4B946] text-white font-bold rounded-xl hover:bg-[#B89D3A] transition-colors text-base disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <a href="/admin/global/login" className="text-xs text-gray-400 hover:text-gray-600">
            全体管理者ログイン
          </a>
        </div>
      </div>
    </div>
  );
}
