import { useEffect, useState } from 'react';
import { adminClient } from '@/lib/connect/client';
import type { BoothStats } from '@/gen/ts/admin/v1/admin_pb';

export default function GlobalDashboardScreen() {
  const [booths, setBooths] = useState<BoothStats[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      const res = await adminClient.getDashboard({});
      setBooths(res.booths);
    } catch {
      setError('データの取得に失敗しました。管理者セッションが切れている可能性があります。');
    }
  };

  useEffect(() => {
    fetchDashboard();
    const id = setInterval(fetchDashboard, 10000);
    return () => clearInterval(id);
  }, []);

  const totalWaiting = booths.reduce((s, b) => s + b.waitingCount, 0);
  const totalAdmitted = booths.reduce((s, b) => s + b.admittedToday, 0);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gray-800 text-white py-4 px-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">全体管理ダッシュボード</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-300">10秒ごとに自動更新</span>
          <a href="/admin/global/booths" className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded">ブース管理</a>
          <a href="/admin/global/risk-explanation" className="text-sm bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded">リスク説明文</a>
          <a href="/admin/global/notifications" className="text-sm bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded">通知テンプレート</a>
          <a href="/admin/global/csv-export" className="text-sm bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded">CSVエクスポート</a>
          <a href="/admin/global/reset" className="text-sm bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded">データリセット</a>
          <a href="/admin" className="text-sm text-gray-300 hover:text-white">スタッフ画面へ</a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500 mb-1">全体の待機人数</div>
            <div className="text-4xl font-bold text-blue-600">{totalWaiting}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500 mb-1">本日の入場総数</div>
            <div className="text-4xl font-bold text-green-600">{totalAdmitted}</div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-4 mb-6">
            {error}
            <a href="/admin/global/login" className="ml-2 underline text-sm">再ログイン</a>
          </div>
        )}

        <div className="grid gap-4">
          {booths.map((b) => (
            <div key={b.boothId} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">{b.boothName}</h3>
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="text-xs text-gray-500">待機中</div>
                    <div className="text-2xl font-bold text-blue-600">{b.waitingCount}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">保留中</div>
                    <div className="text-2xl font-bold text-red-500">{b.pendingCount}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">本日入場</div>
                    <div className="text-2xl font-bold text-green-600">{b.admittedToday}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {booths.length === 0 && !error && (
            <div className="text-center py-12 text-gray-400">データを読み込み中...</div>
          )}
        </div>
      </div>
    </div>
  );
}
