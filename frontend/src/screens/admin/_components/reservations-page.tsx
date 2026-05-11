import { useState } from 'react';
import { StaffTicketItem, STATUS_NAMES, STATUS_COLORS } from '../types';
import StatsCards from './stats-cards';

interface Props {
  tickets: StaffTicketItem[];
  onCallNext: (count: number) => Promise<void>;
  onCancelTicket: (ticketId: string) => Promise<void>;
}

export default function ReservationsPage({ tickets, onCallNext, onCancelTicket }: Props) {
  const [searchNumber, setSearchNumber] = useState('');
  const [calling, setCalling] = useState(false);

  const filtered = searchNumber
    ? tickets.filter((t) => t.receptionNumber.toLowerCase().includes(searchNumber.toLowerCase()))
    : tickets;

  const priorityTickets = filtered.filter((t) => t.isPriorityCall && t.status !== 'admitted');
  const normalTickets = filtered.filter((t) => !t.isPriorityCall || t.status === 'admitted');

  const waitingCount = tickets.filter((t) => t.status === 'waiting').length;
  const calledCount = tickets.filter((t) => t.status === 'called').length;
  const admittedCount = tickets.filter((t) => t.status === 'admitted').length;

  const handleCallNext = async () => {
    setCalling(true);
    try {
      await onCallNext(1);
    } finally {
      setCalling(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <>
      <StatsCards waitingCount={waitingCount} calledCount={calledCount} admittedCount={admittedCount} />

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
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
              disabled={waitingCount === 0 || calling}
              className="px-6 py-2 bg-[#D4B946] text-white font-bold rounded-lg hover:bg-[#B89D3A] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              次を呼び出す
            </button>
          </div>
        </div>
      </div>

      {priorityTickets.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⭐</span>
            <h3 className="font-bold text-amber-800 text-lg">優先呼び出し</h3>
            <span className="text-sm text-amber-600">（一度保留になった来場者）</span>
          </div>
          <div className="space-y-2">
            {priorityTickets.map((t) => (
              <div key={t.ticketId} className="bg-amber-100 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold text-amber-900">{t.receptionNumber}</span>
                  <span className="text-sm font-medium text-gray-800">{t.nickname}</span>
                  <span className="text-sm text-gray-600">{t.participantCount}名</span>
                  <span className={`inline-block px-2 py-1 text-xs font-bold rounded-full ${STATUS_COLORS[t.status]}`}>
                    {STATUS_NAMES[t.status]}
                  </span>
                </div>
                <button
                  onClick={() => onCancelTicket(t.ticketId)}
                  className="px-3 py-1 bg-gray-400 text-white text-sm font-bold rounded hover:bg-gray-500 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">受付番号</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">ニックネーム</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">人数</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">受付時刻</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">状態</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {normalTickets.map((t) => (
                <tr key={t.ticketId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="text-lg font-bold text-[#5A4A20]">{t.receptionNumber}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">{t.nickname}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">{t.participantCount}名</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">{formatTime(t.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-3 py-1 text-xs font-bold rounded-full ${STATUS_COLORS[t.status]}`}>
                      {STATUS_NAMES[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.status !== 'admitted' && t.status !== 'cancelled' && (
                      <button
                        onClick={() => onCancelTicket(t.ticketId)}
                        className="px-2 py-1 bg-gray-200 text-gray-600 text-xs font-bold rounded hover:bg-gray-300 transition-colors"
                        title="キャンセル"
                      >
                        キャンセル
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {normalTickets.length === 0 && priorityTickets.length === 0 && (
          <div className="text-center py-12 text-gray-500">該当する受付がありません</div>
        )}
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        全 {filtered.length} 件（待機 {waitingCount} / 呼出中 {calledCount} / 入場済み {admittedCount}）
      </div>
    </>
  );
}
