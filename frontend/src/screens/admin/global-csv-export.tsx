'use client';

import { useState } from 'react';
import { adminClient } from '@/lib/connect/client';
import { ExportType } from '@/gen/ts/admin/v1/admin_pb';

type ExportItem = {
  type: ExportType;
  label: string;
  description: string;
  filename: string;
};

const EXPORTS: ExportItem[] = [
  {
    type: ExportType.VISITORS,
    label: '来場者一覧',
    description: '受付番号・ニックネーム・登録時刻',
    filename: 'visitors',
  },
  {
    type: ExportType.TICKETS,
    label: '整理券一覧',
    description: '全整理券の取得・状態・入場時刻',
    filename: 'tickets',
  },
  {
    type: ExportType.ADMISSIONS,
    label: '入場処理一覧',
    description: '全入場処理レコード',
    filename: 'admissions',
  },
  {
    type: ExportType.BOOTH_SUMMARY,
    label: 'ブース別集計',
    description: 'ブースごとの予約数・入場数・キャンセル数',
    filename: 'booth_summary',
  },
  {
    type: ExportType.HOURLY_STATS,
    label: '時間帯別集計',
    description: '30分ごとの来場者数推移',
    filename: 'hourly_stats',
  },
  {
    type: ExportType.MATCH_SESSIONS,
    label: 'マッチセッション一覧',
    description: 'マッチメイキングブースのセッション履歴',
    filename: 'match_sessions',
  },
];

export default function GlobalCsvExportScreen() {
  const [pending, setPending] = useState<ExportType | null>(null);
  const [confirming, setConfirming] = useState<ExportItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (item: ExportItem) => {
    setPending(item.type);
    setError(null);
    try {
      const res = await adminClient.exportCSV({ exportType: item.type });
      const blob = new Blob([res.csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || `${item.filename}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(`${item.label} のエクスポートに失敗しました。`);
    } finally {
      setPending(null);
      setConfirming(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gray-800 text-white py-4 px-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">CSVエクスポート</h1>
        <a href="/admin/global/dashboard" className="text-sm text-gray-300 hover:text-white">
          ← ダッシュボードへ
        </a>
      </header>

      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-lg p-4 mb-6 text-sm">
          CSVファイルには個人情報が含まれる場合があります。取り扱いに注意してください。
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-4 mb-6 text-sm">
            {error}
          </div>
        )}

        <div className="grid gap-4">
          {EXPORTS.map((item) => (
            <div key={item.type} className="bg-white rounded-lg shadow p-5 flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800">{item.label}</div>
                <div className="text-sm text-gray-500 mt-0.5">{item.description}</div>
              </div>
              <button
                onClick={() => setConfirming(item)}
                disabled={pending !== null}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm px-4 py-2 rounded"
              >
                ダウンロード
              </button>
            </div>
          ))}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-2">確認</h2>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-medium">「{confirming.label}」</span> をダウンロードします。
              <br />
              個人情報を含む可能性があります。よろしいですか？
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleExport(confirming)}
                disabled={pending !== null}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm px-4 py-2 rounded"
              >
                {pending !== null ? 'エクスポート中...' : 'ダウンロード'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
