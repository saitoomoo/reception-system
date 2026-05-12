import { useState } from 'react';
import { StaffTicketItem, STATUS_NAMES, STATUS_COLORS } from '../types';
import StatsCards from './stats-cards';

interface Props {
  tickets: StaffTicketItem[];
  onCallNext: (count: number) => Promise<void>;
  onCancelTicket: (ticketId: string) => Promise<void>;
  onRestoreTicket: (ticketId: string) => Promise<void>;
}

export default function ReservationsPage({ tickets, onCallNext, onCancelTicket, onRestoreTicket }: Props) {
  const [searchNumber, setSearchNumber] = useState('');
  const [calling, setCalling] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const filtered = searchNumber
    ? tickets.filter((t) => t.receptionNumber.toLowerCase().includes(searchNumber.toLowerCase()))
    : tickets;

  const priorityTickets = filtered.filter((t) => t.isPriorityCall && t.status === 'called');
  const calledTickets   = filtered.filter((t) => t.status === 'called' && !t.isPriorityCall);
  const waitingTickets  = filtered.filter((t) => t.status === 'waiting');
  const pendingTickets  = filtered.filter((t) => t.status === 'pending' && !t.isPriorityCall);
  const admittedTickets = filtered.filter((t) => t.status === 'admitted');

  const waitingCount  = tickets.filter((t) => t.status === 'waiting').length;
  const calledCount   = tickets.filter((t) => t.status === 'called').length;
  const pendingCount  = tickets.filter((t) => t.status === 'pending').length;
  const admittedCount = tickets.filter((t) => t.status === 'admitted').length;

  const handleCallNext = async () => {
    setCalling(true);
    try { await onCallNext(1); } finally { setCalling(false); }
  };

  const handleRestore = async (ticketId: string) => {
    setRestoringId(ticketId);
    try { await onRestoreTicket(ticketId); } finally { setRestoringId(null); }
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const TicketRow = ({ t, extra }: { t: StaffTicketItem; extra?: React.ReactNode }) => (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3"><span className="text-base font-bold text-[#5A4A20]">{t.receptionNumber}</span></td>
      <td className="px-4 py-3 text-sm text-gray-900">{t.nickname}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{t.participantCount}名</td>
      <td className="px-4 py-3 text-sm text-gray-500">{fmt(t.createdAt)}</td>
      <td className="px-4 py-3">
        <span className={`inline-block px-2 py-1 text-xs font-bold rounded-full ${STATUS_COLORS[t.status]}`}>
          {STATUS_NAMES[t.status]}
        </span>
      </td>
      <td className="px-4 py-3 flex gap-2">
        {extra}
        {t.status !== 'admitted' && t.status !== 'cancelled' && (
          <button
            onClick={() => onCancelTicket(t.ticketId)}
            className="px-2 py-1 bg-gray-200 text-gray-600 text-xs font-bold rounded hover:bg-gray-300"
          >
            キャンセル
          </button>
        )}
      </td>
    </tr>
  );

  const TableWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              {['受付番号', 'ニックネーム', '人数', '受付時刻', '状態', '操作'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-bold text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">{children}</tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <StatsCards
        waitingCount={waitingCount}
        calledCount={calledCount}
        pendingCount={pendingCount}
        admittedCount={admittedCount}
      />

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold text-gray-600 mb-1">受付番号で検索</label>
          <input
            type="text"
            value={searchNumber}
            onChange={(e) => setSearchNumber(e.target.value)}
            placeholder="A-105"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#D4B946]"
          />
        </div>
        <button
          onClick={handleCallNext}
          disabled={waitingCount === 0 || calling}
          className="px-5 py-2 bg-[#D4B946] text-white font-bold rounded hover:bg-[#B89D3A] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          次を呼び出す
        </button>
      </div>

      {/* 優先呼び出し */}
      {priorityTickets.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span>⭐</span>
            <h3 className="font-bold text-amber-800">優先呼び出し</h3>
            <span className="text-xs text-amber-600">（保留から戻った来場者）</span>
          </div>
          <div className="space-y-2">
            {priorityTickets.map((t) => (
              <div key={t.ticketId} className="bg-amber-100 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-amber-900">{t.receptionNumber}</span>
                  <span className="text-sm text-gray-800">{t.nickname}</span>
                  <span className="text-sm text-gray-600">{t.participantCount}名</span>
                </div>
                <button
                  onClick={() => onCancelTicket(t.ticketId)}
                  className="px-3 py-1 bg-gray-400 text-white text-xs font-bold rounded hover:bg-gray-500"
                >
                  キャンセル
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 呼出中 */}
      {calledTickets.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-yellow-700 mb-2">呼出中 ({calledTickets.length})</h3>
          <TableWrapper>
            {calledTickets.map((t) => <TicketRow key={t.ticketId} t={t} />)}
          </TableWrapper>
        </>
      )}

      {/* 待機中 */}
      {waitingTickets.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-blue-700 mb-2">待機中 ({waitingTickets.length})</h3>
          <TableWrapper>
            {waitingTickets.map((t) => <TicketRow key={t.ticketId} t={t} />)}
          </TableWrapper>
        </>
      )}

      {/* 保留中 */}
      {pendingTickets.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-red-600 mb-2">保留中 ({pendingTickets.length})</h3>
          <TableWrapper>
            {pendingTickets.map((t) => (
              <TicketRow
                key={t.ticketId}
                t={t}
                extra={
                  <button
                    onClick={() => handleRestore(t.ticketId)}
                    disabled={restoringId === t.ticketId}
                    className="px-2 py-1 bg-yellow-500 text-white text-xs font-bold rounded hover:bg-yellow-600 disabled:opacity-50"
                  >
                    {restoringId === t.ticketId ? '...' : '呼び戻す'}
                  </button>
                }
              />
            ))}
          </TableWrapper>
        </>
      )}

      {/* 入場済み */}
      {admittedTickets.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-bold text-green-700 mb-2">
            入場済み ({admittedTickets.length}) ▶
          </summary>
          <TableWrapper>
            {admittedTickets.map((t) => <TicketRow key={t.ticketId} t={t} />)}
          </TableWrapper>
        </details>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg shadow">
          該当する受付がありません
        </div>
      )}

      <div className="mt-4 text-center text-xs text-gray-400">
        待機 {waitingCount} / 呼出中 {calledCount} / 保留中 {pendingCount} / 入場済み {admittedCount}
      </div>
    </>
  );
}
