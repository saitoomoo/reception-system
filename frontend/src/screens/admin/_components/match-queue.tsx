import { useState, useCallback, useEffect } from 'react';
import { staffClient } from '@/lib/connect/client';

interface PublicGroup {
  ticketId: string;
  sequenceInBooth: number;
  participantCount: number;
}

interface PrivateGroup {
  ticketId: string;
  sequenceInBooth: number;
  participantCount: number;
  receptionNumber: string;
  nickname: string;
}

interface ActiveSession {
  sessionId: string;
  mode: string;
  status: string;
  participantCount: number;
  createdAt: string;
}

interface QueueStatus {
  publicWaiting: PublicGroup[];
  publicWaitingTotal: number;
  targetPartySize: number;
  minPartySize: number;
  privateWaiting: PrivateGroup[];
  activeSessions: ActiveSession[];
}

export default function MatchQueue() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forcing, setForcing] = useState(false);
  const [callingPrivate, setCallingPrivate] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [forceConfirm, setForceConfirm] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await staffClient.getMatchQueueStatus({});
      setStatus({
        publicWaiting: res.publicWaiting.map((g) => ({
          ticketId: g.ticketId,
          sequenceInBooth: g.sequenceInBooth,
          participantCount: g.participantCount,
        })),
        publicWaitingTotal: res.publicWaitingTotal,
        targetPartySize: res.targetPartySize,
        minPartySize: res.minPartySize,
        privateWaiting: res.privateWaiting.map((g) => ({
          ticketId: g.ticketId,
          sequenceInBooth: g.sequenceInBooth,
          participantCount: g.participantCount,
          receptionNumber: g.receptionNumber,
          nickname: g.nickname,
        })),
        activeSessions: res.activeSessions.map((s) => ({
          sessionId: s.sessionId,
          mode: s.mode,
          status: s.status,
          participantCount: s.participantCount,
          createdAt: s.createdAt,
        })),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'データ取得に失敗しました');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleForceStart = async () => {
    setForcing(true);
    setForceConfirm(false);
    try {
      await staffClient.forceStartMatch({});
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : '強制開催に失敗しました');
    } finally {
      setForcing(false);
    }
  };

  const handleCallPrivate = async (ticketId: string) => {
    setCallingPrivate(ticketId);
    try {
      await staffClient.callPrivateMatch({ ticketId });
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : '呼び出しに失敗しました');
    } finally {
      setCallingPrivate(null);
    }
  };

  const handleComplete = async (sessionId: string) => {
    setCompleting(sessionId);
    try {
      await staffClient.completeMatchSession({ sessionId });
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'セッション完了に失敗しました');
    } finally {
      setCompleting(null);
    }
  };

  const fmt = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  if (!status) {
    return (
      <div className="text-center py-12 text-gray-500">
        {error ? <p className="text-red-500">{error}</p> : <p>読み込み中...</p>}
      </div>
    );
  }

  const canForceStart = status.publicWaitingTotal >= status.minPartySize;

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Public waiting section */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-gray-800">
              マッチメイキング待機 (public)
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              累積人数: <span className="font-bold text-[#5A4A20]">{status.publicWaitingTotal}</span>
              {' / '}{status.targetPartySize}人
              {status.minPartySize > 0 && (
                <span className="ml-2 text-xs text-gray-400">（最低 {status.minPartySize}人）</span>
              )}
            </p>
          </div>
          {forceConfirm ? (
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-700">{status.publicWaitingTotal}人で開催しますか？</span>
              <button
                onClick={handleForceStart}
                disabled={forcing}
                className="px-3 py-1.5 bg-red-500 text-white text-sm font-bold rounded hover:bg-red-600 disabled:opacity-50"
              >
                {forcing ? '...' : '開催する'}
              </button>
              <button
                onClick={() => setForceConfirm(false)}
                className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm font-bold rounded hover:bg-gray-300"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <button
              onClick={() => setForceConfirm(true)}
              disabled={!canForceStart || forcing}
              className="px-4 py-2 bg-[#D4B946] text-white font-bold text-sm rounded hover:bg-[#B89D3A] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              強制開催
            </button>
          )}
        </div>

        {status.publicWaiting.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">待機中のグループはありません</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-1 px-2 text-xs font-bold text-gray-500">整理券番号</th>
                <th className="text-right py-1 px-2 text-xs font-bold text-gray-500">人数</th>
              </tr>
            </thead>
            <tbody>
              {status.publicWaiting.map((g) => (
                <tr key={g.ticketId} className="border-b border-gray-50">
                  <td className="py-2 px-2 font-bold text-[#5A4A20]">#{g.sequenceInBooth}</td>
                  <td className="py-2 px-2 text-right text-gray-700">{g.participantCount}名</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Private waiting section */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-gray-800 mb-3">プライベートマッチ待機</h3>
        {status.privateWaiting.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">待機中のプライベートグループはありません</p>
        ) : (
          <div className="space-y-2">
            {status.privateWaiting.map((g) => (
              <div key={g.ticketId} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-[#5A4A20]">{g.receptionNumber}</span>
                  <span className="text-sm text-gray-700">{g.nickname}</span>
                  <span className="text-sm text-gray-500">{g.participantCount}名</span>
                </div>
                <button
                  onClick={() => handleCallPrivate(g.ticketId)}
                  disabled={callingPrivate === g.ticketId}
                  className="px-3 py-1.5 bg-[#D4B946] text-white text-sm font-bold rounded hover:bg-[#B89D3A] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {callingPrivate === g.ticketId ? '...' : '呼び出す'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active sessions section */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-gray-800 mb-3">体験中 / 呼出中セッション</h3>
        {status.activeSessions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">進行中のセッションはありません</p>
        ) : (
          <div className="space-y-2">
            {status.activeSessions.map((s) => (
              <div key={s.sessionId} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full bg-[#5A4A20]">
                    {s.mode === 'private' ? 'プライベート' : 'マッチング'}
                  </span>
                  <span className="text-sm text-gray-700">{s.participantCount}名</span>
                  <span className="text-xs text-gray-500">{fmt(s.createdAt)} 開始</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    s.status === 'in_progress' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {s.status === 'in_progress' ? '体験中' : '呼出中'}
                  </span>
                </div>
                <button
                  onClick={() => handleComplete(s.sessionId)}
                  disabled={completing === s.sessionId}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {completing === s.sessionId ? '...' : '体験完了'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
