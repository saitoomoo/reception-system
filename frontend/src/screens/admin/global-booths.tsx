import { useEffect, useState, useCallback } from 'react';
import { adminClient } from '@/lib/connect/client';
import type { AdminBooth } from '@/gen/ts/admin/v1/admin_pb';
import BoothForm, { type BoothFormData } from './_components/booth-form';
import PasswordChangeDialog from './_components/password-change-dialog';

type View = 'list' | 'create' | 'edit';

export default function GlobalBoothsScreen() {
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [editTarget, setEditTarget] = useState<AdminBooth | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<AdminBooth | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchBooths = useCallback(async () => {
    try {
      const res = await adminClient.listAdminBooths({});
      setBooths(res.booths);
      setError(null);
    } catch {
      setError('ブース一覧の取得に失敗しました。管理者セッションが切れている可能性があります。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooths();
  }, [fetchBooths]);

  const handleCreate = async (data: BoothFormData) => {
    await adminClient.createBooth({
      name: data.name,
      description: data.description,
      location: data.location,
      openAt: data.openAt,
      closeAt: data.closeAt,
      experienceType: data.experienceType,
      maxParticipantsPerTicket: data.maxParticipantsPerTicket,
      concurrentCapacity: data.concurrentCapacity,
      targetPartySize: data.targetPartySize,
      minPartySize: data.minPartySize,
      allowPrivateMatch: data.allowPrivateMatch,
      estimatedMinutesPerPerson: data.estimatedMinutesPerPerson,
      estimatedMinutesPerSession: data.estimatedMinutesPerSession,
      callThreshold: data.callThreshold,
      callResendMinutes: data.callResendMinutes,
      cooldownMinutes: data.cooldownMinutes,
      isAccepting: data.isAccepting,
      coverImageUrl: data.coverImageUrl,
      introVideoUrl: data.introVideoUrl,
      detailVideoUrl: data.detailVideoUrl,
      surveyUrl: data.surveyUrl,
      notes: data.notes,
      staffPassword: data.staffPassword,
    });
    await fetchBooths();
    setView('list');
  };

  const handleUpdate = async (boothId: string, data: BoothFormData) => {
    await adminClient.updateBooth({
      boothId,
      name: data.name,
      description: data.description,
      location: data.location,
      openAt: data.openAt,
      closeAt: data.closeAt,
      experienceType: data.experienceType,
      maxParticipantsPerTicket: data.maxParticipantsPerTicket,
      concurrentCapacity: data.concurrentCapacity,
      targetPartySize: data.targetPartySize,
      minPartySize: data.minPartySize,
      allowPrivateMatch: data.allowPrivateMatch,
      estimatedMinutesPerPerson: data.estimatedMinutesPerPerson,
      estimatedMinutesPerSession: data.estimatedMinutesPerSession,
      callThreshold: data.callThreshold,
      callResendMinutes: data.callResendMinutes,
      cooldownMinutes: data.cooldownMinutes,
      isAccepting: data.isAccepting,
      coverImageUrl: data.coverImageUrl,
      introVideoUrl: data.introVideoUrl,
      detailVideoUrl: data.detailVideoUrl,
      surveyUrl: data.surveyUrl,
      notes: data.notes,
    });
    await fetchBooths();
    setView('list');
    setEditTarget(null);
  };

  const handleArchive = async (boothId: string) => {
    if (!confirm('このブースをアーカイブしますか？スタッフはログインできなくなります。')) return;
    try {
      await adminClient.archiveBooth({ boothId });
      await fetchBooths();
    } catch {
      setActionError('アーカイブに失敗しました。');
    }
  };

  const handleUnarchive = async (boothId: string) => {
    try {
      await adminClient.unarchiveBooth({ boothId });
      await fetchBooths();
    } catch {
      setActionError('復元に失敗しました。');
    }
  };

  const handleDelete = async (boothId: string) => {
    if (!confirm('このブースを完全に削除しますか？この操作は取り消せません。')) return;
    try {
      await adminClient.deleteBooth({ boothId });
      await fetchBooths();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('active tickets')) {
        setActionError('アクティブな整理券があるため削除できません。先にアーカイブしてください。');
      } else {
        setActionError('削除に失敗しました。');
      }
    }
  };

  const handlePasswordChange = async (boothId: string, newPassword: string) => {
    await adminClient.updateBoothPassword({ boothId, newPassword });
    setPasswordTarget(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="bg-gray-800 text-white py-4 px-6 flex items-center gap-4">
          <button onClick={() => setView('list')} className="text-gray-300 hover:text-white text-sm">← 戻る</button>
          <h1 className="text-xl font-bold">ブース新規作成</h1>
        </header>
        <div className="max-w-3xl mx-auto p-6">
          <BoothForm mode="create" onSubmit={(data) => handleCreate(data)} onCancel={() => setView('list')} />
        </div>
      </div>
    );
  }

  if (view === 'edit' && editTarget) {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="bg-gray-800 text-white py-4 px-6 flex items-center gap-4">
          <button onClick={() => { setView('list'); setEditTarget(null); }} className="text-gray-300 hover:text-white text-sm">← 戻る</button>
          <h1 className="text-xl font-bold">ブース編集: {editTarget.name}</h1>
        </header>
        <div className="max-w-3xl mx-auto p-6">
          <BoothForm
            mode="edit"
            initialData={editTarget}
            onSubmit={(data) => handleUpdate(editTarget!.boothId, data)}
            onCancel={() => { setView('list'); setEditTarget(null); }}
          />
        </div>
      </div>
    );
  }

  const activeBooths = booths.filter(b => !b.isArchived);
  const archivedBooths = booths.filter(b => b.isArchived);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gray-800 text-white py-4 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/admin/global/dashboard" className="text-gray-300 hover:text-white text-sm">← ダッシュボード</a>
          <h1 className="text-xl font-bold">ブース管理</h1>
        </div>
        <button
          onClick={() => setView('create')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium"
        >
          + 新規ブース作成
        </button>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-4">
            {error}
            <a href="/admin/global/login" className="ml-2 underline text-sm">再ログイン</a>
          </div>
        )}
        {actionError && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-4 flex justify-between">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700">✕</button>
          </div>
        )}

        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">アクティブなブース ({activeBooths.length})</h2>
          {activeBooths.length === 0 ? (
            <div className="text-center py-8 text-gray-400 bg-white rounded-lg shadow">ブースがありません</div>
          ) : (
            <div className="space-y-3">
              {activeBooths.map(b => (
                <BoothCard
                  key={b.boothId}
                  booth={b}
                  onEdit={() => { setEditTarget(b); setView('edit'); }}
                  onArchive={() => handleArchive(b.boothId)}
                  onDelete={() => handleDelete(b.boothId)}
                  onChangePassword={() => setPasswordTarget(b)}
                />
              ))}
            </div>
          )}
        </section>

        {archivedBooths.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-500 mb-3">アーカイブ済み ({archivedBooths.length})</h2>
            <div className="space-y-3">
              {archivedBooths.map(b => (
                <BoothCard
                  key={b.boothId}
                  booth={b}
                  archived
                  onEdit={() => { setEditTarget(b); setView('edit'); }}
                  onUnarchive={() => handleUnarchive(b.boothId)}
                  onDelete={() => handleDelete(b.boothId)}
                  onChangePassword={() => setPasswordTarget(b)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {passwordTarget && (
        <PasswordChangeDialog
          boothName={passwordTarget.name}
          onSubmit={(pw) => handlePasswordChange(passwordTarget.boothId, pw)}
          onClose={() => setPasswordTarget(null)}
        />
      )}
    </div>
  );
}

const EXPERIENCE_TYPE_LABELS: Record<string, string> = {
  sequential: '順次体験型',
  parallel: '同時並行型',
  individual: '個人体験型',
  matchmaking: 'マッチメイキング型',
};

function BoothCard({
  booth,
  archived = false,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
  onChangePassword,
}: {
  booth: AdminBooth;
  archived?: boolean;
  onEdit: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
  onChangePassword: () => void;
}) {
  return (
    <div className={`bg-white rounded-lg shadow p-4 ${archived ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-gray-800">{booth.name}</h3>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {EXPERIENCE_TYPE_LABELS[booth.experienceType] ?? booth.experienceType}
            </span>
            {!booth.isAccepting && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">発行停止中</span>}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{booth.location}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {booth.openAt ? new Date(booth.openAt).toLocaleString('ja-JP') : '—'} 〜 {booth.closeAt ? new Date(booth.closeAt).toLocaleString('ja-JP') : '—'}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
          <button onClick={onEdit} className="text-xs border border-gray-300 hover:bg-gray-50 px-2 py-1 rounded">編集</button>
          <button onClick={onChangePassword} className="text-xs border border-gray-300 hover:bg-gray-50 px-2 py-1 rounded">PW変更</button>
          {archived ? (
            <button onClick={onUnarchive} className="text-xs border border-green-400 text-green-700 hover:bg-green-50 px-2 py-1 rounded">復元</button>
          ) : (
            <button onClick={onArchive} className="text-xs border border-yellow-400 text-yellow-700 hover:bg-yellow-50 px-2 py-1 rounded">アーカイブ</button>
          )}
          <button onClick={onDelete} className="text-xs border border-red-400 text-red-600 hover:bg-red-50 px-2 py-1 rounded">削除</button>
        </div>
      </div>
    </div>
  );
}
