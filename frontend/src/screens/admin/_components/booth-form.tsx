import { useState } from 'react';
import type { AdminBooth } from '@/gen/ts/admin/v1/admin_pb';

export type BoothFormData = {
  name: string;
  description: string;
  location: string;
  openAt: string;
  closeAt: string;
  experienceType: string;
  maxParticipantsPerTicket: number;
  concurrentCapacity: number;
  targetPartySize: number;
  minPartySize: number;
  allowPrivateMatch: boolean;
  estimatedMinutesPerPerson: number;
  estimatedMinutesPerSession: number;
  callThreshold: number;
  callResendMinutes: number;
  cooldownMinutes: number;
  isAccepting: boolean;
  coverImageUrl: string;
  introVideoUrl: string;
  detailVideoUrl: string;
  surveyUrl: string;
  notes: string;
  staffPassword: string;
};

function toLocalDatetimeValue(isoString: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toISO(localDatetime: string): string {
  if (!localDatetime) return '';
  return new Date(localDatetime).toISOString();
}

function initFormData(booth?: AdminBooth): BoothFormData {
  if (!booth) {
    return {
      name: '',
      description: '',
      location: '',
      openAt: '',
      closeAt: '',
      experienceType: 'sequential',
      maxParticipantsPerTicket: 1,
      concurrentCapacity: 1,
      targetPartySize: 0,
      minPartySize: 0,
      allowPrivateMatch: false,
      estimatedMinutesPerPerson: 0,
      estimatedMinutesPerSession: 0,
      callThreshold: 3,
      callResendMinutes: 10,
      cooldownMinutes: 0,
      isAccepting: true,
      coverImageUrl: '',
      introVideoUrl: '',
      detailVideoUrl: '',
      surveyUrl: '',
      notes: '',
      staffPassword: '',
    };
  }
  return {
    name: booth.name,
    description: booth.description,
    location: booth.location,
    openAt: toLocalDatetimeValue(booth.openAt),
    closeAt: toLocalDatetimeValue(booth.closeAt),
    experienceType: booth.experienceType,
    maxParticipantsPerTicket: booth.maxParticipantsPerTicket,
    concurrentCapacity: booth.concurrentCapacity,
    targetPartySize: booth.targetPartySize,
    minPartySize: booth.minPartySize,
    allowPrivateMatch: booth.allowPrivateMatch,
    estimatedMinutesPerPerson: booth.estimatedMinutesPerPerson,
    estimatedMinutesPerSession: booth.estimatedMinutesPerSession,
    callThreshold: booth.callThreshold,
    callResendMinutes: booth.callResendMinutes,
    cooldownMinutes: booth.cooldownMinutes,
    isAccepting: booth.isAccepting,
    coverImageUrl: booth.coverImageUrl,
    introVideoUrl: booth.introVideoUrl,
    detailVideoUrl: booth.detailVideoUrl,
    surveyUrl: booth.surveyUrl,
    notes: booth.notes,
    staffPassword: '',
  };
}

type Props = {
  mode: 'create' | 'edit';
  initialData?: AdminBooth;
  onSubmit: (data: BoothFormData) => Promise<void>;
  onCancel: () => void;
};

export default function BoothForm({ mode, initialData, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<BoothFormData>(() => initFormData(initialData));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof BoothFormData>(key: K, value: BoothFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('ブース名は必須です'); return; }
    if (!form.openAt || !form.closeAt) { setError('開始・終了時間は必須です'); return; }
    if (mode === 'create' && !form.staffPassword) { setError('スタッフパスワードは必須です'); return; }

    const payload = {
      ...form,
      openAt: toISO(form.openAt),
      closeAt: toISO(form.closeAt),
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const isMatchmaking = form.experienceType === 'matchmaking';
  const isParallel = form.experienceType === 'parallel';
  const isIndividual = form.experienceType === 'individual';

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
      {error && <div className="bg-red-50 border border-red-300 text-red-700 rounded p-3 text-sm">{error}</div>}

      <section className="space-y-4">
        <h2 className="font-semibold text-gray-700 border-b pb-1">基本情報</h2>
        <Field label="ブース名 *">
          <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} required />
        </Field>
        <Field label="説明">
          <textarea className={inputCls + ' h-20 resize-none'} value={form.description} onChange={e => set('description', e.target.value)} />
        </Field>
        <Field label="開催場所">
          <input className={inputCls} value={form.location} onChange={e => set('location', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="受付開始">
            <input type="datetime-local" className={inputCls} value={form.openAt} onChange={e => set('openAt', e.target.value)} />
          </Field>
          <Field label="受付終了">
            <input type="datetime-local" className={inputCls} value={form.closeAt} onChange={e => set('closeAt', e.target.value)} />
          </Field>
        </div>
        <Field label="体験タイプ">
          <select className={inputCls} value={form.experienceType} onChange={e => set('experienceType', e.target.value)}>
            <option value="sequential">順次体験型 (sequential)</option>
            <option value="parallel">同時並行型 (parallel)</option>
            <option value="individual">個人体験型 (individual)</option>
            <option value="matchmaking">マッチメイキング型 (matchmaking)</option>
          </select>
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-gray-700 border-b pb-1">体験設定</h2>
        {!isIndividual && (
          <Field label="1整理券あたりの最大人数">
            <NumberInput value={form.maxParticipantsPerTicket} onChange={v => set('maxParticipantsPerTicket', v)} min={1} />
          </Field>
        )}
        {isParallel && (
          <Field label="同時並行可能人数 (concurrent_capacity)">
            <NumberInput value={form.concurrentCapacity} onChange={v => set('concurrentCapacity', v)} min={1} />
          </Field>
        )}
        {isMatchmaking && (
          <>
            <Field label="理想の開催人数 (target_party_size)">
              <NumberInput value={form.targetPartySize} onChange={v => set('targetPartySize', v)} min={1} />
            </Field>
            <Field label="最低開催人数 (min_party_size)">
              <NumberInput value={form.minPartySize} onChange={v => set('minPartySize', v)} min={1} />
            </Field>
            <Field label="">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.allowPrivateMatch} onChange={e => set('allowPrivateMatch', e.target.checked)} />
                <span className="text-sm text-gray-700">プライベートマッチを許可する</span>
              </label>
            </Field>
          </>
        )}
        {!isMatchmaking && !isParallel && (
          <Field label="1人あたりの体験時間 (分)">
            <NumberInput value={form.estimatedMinutesPerPerson} onChange={v => set('estimatedMinutesPerPerson', v)} min={0} />
          </Field>
        )}
        {(isParallel || isMatchmaking) && (
          <Field label="1セッションの時間 (分)">
            <NumberInput value={form.estimatedMinutesPerSession} onChange={v => set('estimatedMinutesPerSession', v)} min={0} />
          </Field>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-gray-700 border-b pb-1">呼び出し・クールダウン設定</h2>
        <Field label="呼び出しタイミング目安 (call_threshold)">
          <NumberInput value={form.callThreshold} onChange={v => set('callThreshold', v)} min={1} />
        </Field>
        <Field label="呼び出し後pending遷移まで (分)">
          <NumberInput value={form.callResendMinutes} onChange={v => set('callResendMinutes', v)} min={1} />
        </Field>
        <Field label="クールダウン時間 (分, 0=なし)">
          <NumberInput value={form.cooldownMinutes} onChange={v => set('cooldownMinutes', v)} min={0} />
        </Field>
        <Field label="">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isAccepting} onChange={e => set('isAccepting', e.target.checked)} />
            <span className="text-sm text-gray-700">整理券発行を受け付ける</span>
          </label>
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-gray-700 border-b pb-1">メディア・リンク</h2>
        <Field label="カバー画像 URL">
          <input className={inputCls} value={form.coverImageUrl} onChange={e => set('coverImageUrl', e.target.value)} placeholder="https://..." />
        </Field>
        <Field label="紹介動画 URL（ページ上部に表示 / YouTube）">
          <input className={inputCls} value={form.introVideoUrl} onChange={e => set('introVideoUrl', e.target.value)} placeholder="https://youtu.be/..." />
        </Field>
        <Field label="詳細説明動画 URL（詳細説明アコーディオン内に表示 / YouTube）">
          <input className={inputCls} value={form.detailVideoUrl} onChange={e => set('detailVideoUrl', e.target.value)} placeholder="https://youtu.be/..." />
        </Field>
        <Field label="アンケート URL">
          <input className={inputCls} value={form.surveyUrl} onChange={e => set('surveyUrl', e.target.value)} placeholder="https://forms.gle/..." />
        </Field>
        <Field label="詳細説明の注意事項（1行1項目、箇条書きで表示されます）">
          <textarea className={inputCls + ' h-28 resize-none'} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder={"HMD装着時は係員の指示に従ってください\n激しい動きは控えてください\n体験時間は約5分です"} />
        </Field>
      </section>

      {mode === 'create' && (
        <section className="space-y-4">
          <h2 className="font-semibold text-gray-700 border-b pb-1">スタッフパスワード</h2>
          <Field label="スタッフ共有パスワード *">
            <input type="password" className={inputCls} value={form.staffPassword} onChange={e => set('staffPassword', e.target.value)} />
          </Field>
        </section>
      )}

      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">
          キャンセル
        </button>
        <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {submitting ? '保存中...' : mode === 'create' ? 'ブースを作成' : '変更を保存'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>}
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <input
      type="number"
      className={inputCls}
      value={value}
      min={min}
      onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
    />
  );
}

const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
