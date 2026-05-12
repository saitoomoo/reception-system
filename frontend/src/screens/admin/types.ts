export type ReceptionStatus = 'waiting' | 'called' | 'admitted' | 'cancelled' | 'pending';
export type PageType = 'reservations' | 'qr-scanner' | 'manual-admit' | 'match-queue' | 'manual-issue';

export interface StaffTicketItem {
  ticketId: string;
  sequenceInBooth: number;
  receptionNumber: string;
  nickname: string;
  participantCount: number;
  status: ReceptionStatus;
  isPriorityCall: boolean;
  createdAt: string;
  pendingAt?: string;
}

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
  { id: 'reservations', label: '予約一覧', icon: '📋' },
  { id: 'qr-scanner', label: 'QRスキャン', icon: '📷' },
  { id: 'manual-admit', label: '手動入場', icon: '✏️' },
  { id: 'match-queue', label: 'マッチキュー', icon: '🎮' },
  { id: 'manual-issue', label: '特殊フロー発行', icon: '📝' },
];
