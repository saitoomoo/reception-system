export type ReceptionStatus = 'waiting' | 'called' | 'admitted' | 'cancelled' | 'pending';
export type BoothType = 'horse-race' | 'parkour' | 'chanbara';
export type PageType =
  | 'reservations-all'
  | 'reservations-horse'
  | 'reservations-parkour'
  | 'reservations-chanbara'
  | 'booth-settings';

export interface Reception {
  id: number;
  receptionNumber: string;
  booth: BoothType;
  nickname: string;
  partySize: number;
  ages: number[];
  guardianName?: string;
  status: ReceptionStatus;
  is_priority_call?: boolean;
  timestamp: Date;
  calledAt?: Date;
  admittedAt?: Date;
}

export interface BoothSettings {
  name: string;
  overview: string;
  notes: string[];
  videoUrl: string;
  duration: number;
  capacity: number;
  minAge: number;
  minHeight: number;
  isActive: boolean;
  internalNotes: string;
}

export const BOOTH_PASSWORDS: Record<BoothType, string> = {
  'horse-race': '1234',
  parkour: '1234',
  chanbara: '1234',
};

export const BOOTH_NAMES: Record<BoothType, string> = {
  'horse-race': '馬レース',
  parkour: 'パルクール',
  chanbara: 'チャンバラ',
};

export const BOOTH_ICONS: Record<BoothType, string> = {
  'horse-race': '🏇',
  parkour: '🤸',
  chanbara: '⚔️',
};

export const STATUS_NAMES: Record<ReceptionStatus, string> = {
  waiting: '待機中',
  called: '呼出中',
  admitted: '入場済み',
  cancelled: 'キャンセル',
  pending: '保留中',
};

export const STATUS_COLORS: Record<ReceptionStatus, string> = {
  waiting: 'bg-blue-100 text-blue-700',
  called: 'bg-yellow-100 text-yellow-700',
  admitted: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-700',
  pending: 'bg-red-100 text-red-700',
};

export const MENU_ITEMS: { id: PageType; label: string; icon: string }[] = [
  { id: 'reservations-all', label: '予約状況（全体）', icon: '📋' },
  { id: 'reservations-horse', label: '馬レース', icon: '🏇' },
  { id: 'reservations-parkour', label: 'パルクール', icon: '🤸' },
  { id: 'reservations-chanbara', label: 'チャンバラ', icon: '⚔️' },
  { id: 'booth-settings', label: 'ブース情報設定', icon: '⚙️' },
];
