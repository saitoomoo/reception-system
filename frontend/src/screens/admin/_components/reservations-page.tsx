import { useState } from 'react';
import { PageType, Reception, ReceptionStatus, BoothType, BOOTH_NAMES, STATUS_NAMES, STATUS_COLORS } from '../types';
import StatsCards from './stats-cards';

interface Props {
  currentPage: PageType;
  receptions: Reception[];
  onStatusChange: (id: number, status: ReceptionStatus) => void;
  onCancel: (id: number) => void;
}

export default function ReservationsPage({ currentPage, receptions, onStatusChange, onCancel }: Props) {
  const [selectedBooth, setSelectedBooth] = useState<BoothType | 'all'>('all');
  const [searchNumber, setSearchNumber] = useState('');

  const boothType: BoothType | null = (() => {
    if (currentPage === 'reservations-horse') return 'horse-race';
    if (currentPage === 'reservations-parkour') return 'parkour';
    if (currentPage === 'reservations-chanbara') return 'chanbara';
    return null;
  })();

  const pageReceptions = boothType ? receptions.filter((r) => r.booth === boothType) : receptions;

  const filteredReceptions = (() => {
    let filtered = pageReceptions;
    if (currentPage === 'reservations-all' && selectedBooth !== 'all') {
      filtered = filtered.filter((r) => r.booth === selectedBooth);
    }
    if (searchNumber !== '') {
      filtered = filtered.filter((r) =>
        r.receptionNumber.toLowerCase().includes(searchNumber.toLowerCase())
      );
    }
    return filtered;
  })();

  const priorityReceptions = filteredReceptions.filter(
    (r) => r.is_priority_call && r.status !== 'admitted' && r.status !== 'cancelled'
  );
  const normalReceptions = filteredReceptions.filter(
    (r) => !r.is_priority_call || r.status === 'admitted' || r.status === 'cancelled'
  );

  const waitingCount = pageReceptions.filter((r) => r.status === 'waiting').length;
  const calledCount = pageReceptions.filter((r) => r.status === 'called').length;
  const admittedCount = pageReceptions.filter((r) => r.status === 'admitted').length;

  const handleCallNext = () => {
    const waitingList = pageReceptions.filter((r) => r.status === 'waiting');
    if (waitingList.length > 0) {
      onStatusChange(waitingList[0].id, 'called');
    }
  };

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <>
      <StatsCards waitingCount={waitingCount} calledCount={calledCount} admittedCount={admittedCount} />

      {/* コントロールエリア */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          {currentPage === 'reservations-all' && (
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-bold text-gray-700 mb-2">ブースで絞り込み</label>
              <select
                value={selectedBooth}
                onChange={(e) => setSelectedBooth(e.target.value as BoothType | 'all')}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
              >
                <option value="all">すべて</option>
                <option value="horse-race">馬レース</option>
                <option value="parkour">パルクール</option>
                <option value="chanbara">チャンバラ</option>
              </select>
            </div>
          )}

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-bold text-gray-700 mb-2">受付番号で検索</label>
            <input
              type="text"
              value={searchNumber}
              onChange={(e) => setSearchNumber(e.target.value)}
              placeholder="A-105"
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#D4B946]"
            />
          </div>

          <div>
            <button
              onClick={handleCallNext}
              disabled={waitingCount === 0}
              className="px-6 py-2 bg-[#D4B946] text-white font-bold rounded-lg hover:bg-[#B89D3A] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              次を呼び出す
            </button>
          </div>
        </div>
      </div>

      {/* 優先呼び出しセクション */}
      {priorityReceptions.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⭐</span>
            <h3 className="font-bold text-amber-800 text-lg">優先呼び出し</h3>
            <span className="text-sm text-amber-600">（一度保留になった来場者）</span>
          </div>
          <div className="space-y-2">
            {priorityReceptions.map((reception) => (
              <div
                key={reception.id}
                className="bg-amber-100 rounded-lg p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold text-amber-900">{reception.receptionNumber}</span>
                  <span className="text-sm font-medium text-gray-800">{reception.nickname}</span>
                  <span className="text-sm text-gray-600">{reception.partySize}名</span>
                  {currentPage === 'reservations-all' && (
                    <span className="text-xs text-gray-500">{BOOTH_NAMES[reception.booth]}</span>
                  )}
                  <span
                    className={`inline-block px-2 py-1 text-xs font-bold rounded-full ${STATUS_COLORS[reception.status]}`}
                  >
                    {STATUS_NAMES[reception.status]}
                  </span>
                </div>
                <div className="flex gap-2">
                  {reception.status === 'pending' && (
                    <button
                      onClick={() => onStatusChange(reception.id, 'called')}
                      className="px-3 py-1 bg-amber-500 text-white text-sm font-bold rounded hover:bg-amber-600 transition-colors"
                    >
                      呼び出す
                    </button>
                  )}
                  {reception.status === 'called' && (
                    <button
                      onClick={() => onStatusChange(reception.id, 'admitted')}
                      className="px-3 py-1 bg-green-500 text-white text-sm font-bold rounded hover:bg-green-600 transition-colors"
                    >
                      入場処理
                    </button>
                  )}
                  <button
                    onClick={() => onCancel(reception.id)}
                    className="px-3 py-1 bg-gray-400 text-white text-sm font-bold rounded hover:bg-gray-500 transition-colors"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 受付一覧テーブル */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">受付番号</th>
                {currentPage === 'reservations-all' && (
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">ブース</th>
                )}
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">ニックネーム</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">人数</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">年齢</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">受付時刻</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">状態</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {normalReceptions.map((reception) => (
                <tr key={reception.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="text-lg font-bold text-[#5A4A20]">{reception.receptionNumber}</span>
                  </td>
                  {currentPage === 'reservations-all' && (
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900">{BOOTH_NAMES[reception.booth]}</span>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">{reception.nickname}</span>
                    {reception.guardianName && (
                      <div className="text-xs text-gray-500">保護者: {reception.guardianName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">{reception.partySize}名</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">{reception.ages.join(', ')}歳</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">{formatTime(reception.timestamp)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-3 py-1 text-xs font-bold rounded-full ${STATUS_COLORS[reception.status]}`}
                    >
                      {STATUS_NAMES[reception.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <select
                        value={reception.status}
                        onChange={(e) => onStatusChange(reception.id, e.target.value as ReceptionStatus)}
                        className="text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-[#D4B946]"
                      >
                        <option value="waiting">待機中</option>
                        <option value="called">呼出中</option>
                        <option value="admitted">入場済み</option>
                        <option value="pending">保留中</option>
                        <option value="cancelled">キャンセル</option>
                      </select>
                      <button
                        onClick={() => onCancel(reception.id)}
                        className="px-2 py-1 bg-gray-200 text-gray-600 text-xs font-bold rounded hover:bg-gray-300 transition-colors"
                        title="キャンセル"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {normalReceptions.length === 0 && priorityReceptions.length === 0 && (
          <div className="text-center py-12 text-gray-500">該当する受付がありません</div>
        )}
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        全 {filteredReceptions.length} 件の受付
      </div>
    </>
  );
}
