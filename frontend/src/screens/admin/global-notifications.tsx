import { useEffect, useState } from 'react';
import { adminClient } from '@/lib/connect/client';
import type { NotificationTemplate } from '@/gen/ts/admin/v1/admin_pb';

const TEMPLATE_LABELS: Record<string, string> = {
  application_completed: '整理券取得完了',
  call_initial: '初回呼び出し',
  call_resent: '再通知（保留遷移時）',
  cancelled_by_staff: '運営側キャンセル',
};

const SAMPLE_VARS: Record<string, string> = {
  '{{ニックネーム}}': 'サンプル太郎',
  '{{受付番号}}': 'A-105',
  '{{ブース名}}': 'HMD体験ブース',
  '{{場所}}': '第一体育館A',
  '{{整理券番号}}': '42',
};

function applyVars(text: string): string {
  return Object.entries(SAMPLE_VARS).reduce(
    (s, [k, v]) => s.replaceAll(k, v),
    text
  );
}

type EditState = {
  title: string;
  body: string;
  iconUrl: string;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function GlobalNotificationsScreen() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminClient.listNotificationTemplates({})
      .then((res) => {
        setTemplates(res.templates);
        const initial: Record<string, EditState> = {};
        for (const t of res.templates) {
          initial[t.key] = { title: t.title, body: t.body, iconUrl: t.iconUrl };
        }
        setEdits(initial);
      })
      .catch(() => setLoadError('読み込みに失敗しました。管理者セッションが切れている可能性があります。'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (key: string) => {
    const edit = edits[key];
    if (!edit || !edit.title.trim() || !edit.body.trim()) return;
    setSaveStatus((prev) => ({ ...prev, [key]: 'saving' }));
    try {
      const res = await adminClient.updateNotificationTemplate({
        key,
        title: edit.title,
        body: edit.body,
        iconUrl: edit.iconUrl,
      });
      if (res.template) {
        setTemplates((prev) => prev.map((t) => (t.key === key ? res.template! : t)));
      }
      setSaveStatus((prev) => ({ ...prev, [key]: 'saved' }));
      setTimeout(() => setSaveStatus((prev) => ({ ...prev, [key]: 'idle' })), 2000);
    } catch {
      setSaveStatus((prev) => ({ ...prev, [key]: 'error' }));
    }
  };

  const update = (key: string, field: keyof EditState, value: string) => {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    setSaveStatus((prev) => ({ ...prev, [key]: 'idle' }));
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
        <h1 className="text-xl font-bold">通知テンプレート編集</h1>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {loadError && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg p-4 flex justify-between">
            <span>{loadError}</span>
            <a href="/admin/global/login" className="underline text-sm ml-2">再ログイン</a>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          <p className="font-semibold mb-1">利用可能な変数</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {Object.entries(SAMPLE_VARS).map(([k, v]) => (
              <code key={k} className="bg-blue-100 rounded px-2 py-0.5">
                {k} → {v}
              </code>
            ))}
          </div>
        </div>

        {templates.map((t) => {
          const edit = edits[t.key] ?? { title: t.title, body: t.body, iconUrl: t.iconUrl };
          const status = saveStatus[t.key] ?? 'idle';
          const label = TEMPLATE_LABELS[t.key] ?? t.key;

          return (
            <div key={t.key} className="bg-white rounded-lg shadow p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{label}</h2>
                  <code className="text-xs text-gray-400">{t.key}</code>
                </div>
                <div className="flex items-center gap-3">
                  {status === 'saved' && (
                    <span className="text-green-600 text-sm font-medium">保存しました</span>
                  )}
                  {status === 'error' && (
                    <span className="text-red-600 text-sm">保存に失敗しました</span>
                  )}
                  <button
                    onClick={() => handleSave(t.key)}
                    disabled={status === 'saving' || !edit.title.trim() || !edit.body.trim()}
                    className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {status === 'saving' ? '保存中...' : '保存する'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">タイトル</label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={edit.title}
                      onChange={(e) => update(t.key, 'title', e.target.value)}
                      placeholder="例: ブース名 - 呼び出し"
                      maxLength={50}
                    />
                    <p className="text-xs text-gray-400 mt-0.5">{edit.title.length}/50文字</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">本文</label>
                    <textarea
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 h-24 resize-y"
                      value={edit.body}
                      onChange={(e) => update(t.key, 'body', e.target.value)}
                      placeholder="例: {{ニックネーム}} さん、{{ブース名}} へお越しください"
                      maxLength={200}
                    />
                    <p className="text-xs text-gray-400 mt-0.5">{edit.body.length}/200文字（目安100文字以内）</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      アイコン URL <span className="font-normal text-gray-400">（任意）</span>
                    </label>
                    <input
                      type="url"
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={edit.iconUrl}
                      onChange={(e) => update(t.key, 'iconUrl', e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">プレビュー</p>
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-start gap-3">
                      {edit.iconUrl ? (
                        <img
                          src={edit.iconUrl}
                          alt="icon"
                          className="w-10 h-10 rounded object-cover flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-300 flex-shrink-0 flex items-center justify-center text-gray-500 text-xs">icon</div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800 leading-snug">
                          {applyVars(edit.title) || <span className="text-gray-400 font-normal">（タイトル未入力）</span>}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
                          {applyVars(edit.body) || <span className="text-gray-400">（本文未入力）</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">※ 変数をサンプル値で置換したイメージです</p>
                </div>
              </div>
            </div>
          );
        })}

        {templates.length === 0 && !loadError && (
          <div className="text-center py-12 text-gray-400">テンプレートが見つかりません</div>
        )}
      </div>
    </div>
  );
}
