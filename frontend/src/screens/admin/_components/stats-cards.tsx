interface Props {
  waitingCount: number;
  calledCount: number;
  admittedCount: number;
}

export default function StatsCards({ waitingCount, calledCount, admittedCount }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-sm text-gray-600 mb-1">待機中</div>
        <div className="text-3xl font-bold text-blue-600">{waitingCount}</div>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-sm text-gray-600 mb-1">呼出中</div>
        <div className="text-3xl font-bold text-yellow-600">{calledCount}</div>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-sm text-gray-600 mb-1">入場済み</div>
        <div className="text-3xl font-bold text-green-600">{admittedCount}</div>
      </div>
    </div>
  );
}
