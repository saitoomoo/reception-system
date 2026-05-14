import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { ConnectError, Code } from '@connectrpc/connect';
import { staffClient } from '@/lib/connect/client';
import { AdmitOutcome } from '@/gen/ts/admin/v1/admin_pb';

function connectErrorMessage(err: unknown): string {
  if (err instanceof ConnectError) {
    if (err.code === Code.Unauthenticated) {
      return 'セッションが切れています。再ログインしてください';
    }
    if (err.code === Code.Unavailable) {
      return '通信エラーです。再度お試しください';
    }
    return `エラー [${Code[err.code]}]: ${err.rawMessage}`;
  }
  // TypeError はブラウザ・OS によってメッセージが異なるため、種類を問わず通信エラー扱いにする
  if (err instanceof TypeError) {
    return '通信エラーです。再度お試しください';
  }
  const message = err instanceof Error ? err.message : String(err);
  return `予期しないエラーが発生しました: ${message}`;
}

type OutcomeDisplay = {
  type: 'success' | 'warning' | 'info' | 'error';
  message: string;
  detail?: string;
};

interface Props {
  boothId: string;
}

export default function QrScanner({ boothId: _boothId }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeDisplay | null>(null);
  const [confirmPending, setConfirmPending] = useState<{ receptionNumber: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const containerId = 'qr-scanner-container';

  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => undefined);
      }
    };
  }, []);

  const startScanner = async () => {
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;
    setOutcome(null);
    setScanning(true);
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          scanner.stop().catch(() => undefined);
          setScanning(false);
          handleScan(decodedText);
        },
        () => undefined,
      );
    } catch {
      setScanning(false);
      setOutcome({ type: 'error', message: 'カメラの起動に失敗しました' });
    }
  };

  const stopScanner = () => {
    if (scannerRef.current?.isScanning) {
      scannerRef.current.stop().catch(() => undefined);
    }
    setScanning(false);
  };

  const handleScan = async (receptionNumber: string) => {
    setProcessing(true);
    try {
      const res = await staffClient.admitByQR({ receptionNumber });
      switch (res.outcome) {
        case AdmitOutcome.ADMITTED:
          setOutcome({ type: 'success', message: '入場処理が完了しました', detail: receptionNumber });
          break;
        case AdmitOutcome.RESTORED_TO_PRIORITY_CALL:
          setOutcome({
            type: 'warning',
            message: '保留中の方が戻ってきました（優先呼び出し）',
            detail: '次の空きができたら再スキャンしてください',
          });
          break;
        case AdmitOutcome.WAITING_CONFIRMATION_NEEDED:
          setConfirmPending({ receptionNumber });
          setOutcome({
            type: 'warning',
            message: '呼び出し前ですが入場処理しますか？',
            detail: receptionNumber,
          });
          break;
        case AdmitOutcome.ALREADY_ADMITTED:
          setOutcome({ type: 'info', message: '既に入場済みです', detail: receptionNumber });
          break;
        case AdmitOutcome.NOT_FOUND:
          setOutcome({
            type: 'error',
            message: 'このブースの整理券が見つかりません',
            detail: `受付番号: ${receptionNumber}（別ブースの整理券の可能性もあります）`,
          });
          break;
        default:
          setOutcome({ type: 'error', message: '不明な結果です' });
      }
    } catch (err) {
      console.error('[QR scan] admitByQr failed:', err);
      setOutcome({ type: 'error', message: connectErrorMessage(err) });
    } finally {
      setProcessing(false);
    }
  };

  const handleForceAdmit = async () => {
    if (!confirmPending) return;
    setProcessing(true);
    setConfirmPending(null);
    try {
      await staffClient.admitManually({ receptionNumber: confirmPending.receptionNumber, force: true });
      setOutcome({ type: 'success', message: '入場処理が完了しました', detail: confirmPending.receptionNumber });
    } catch (err) {
      console.error('[QR scan] admitManually failed:', err);
      setOutcome({ type: 'error', message: connectErrorMessage(err) });
    } finally {
      setProcessing(false);
    }
  };

  const outcomeColors = {
    success: 'bg-green-50 border-green-400 text-green-800',
    warning: 'bg-amber-50 border-amber-400 text-amber-800',
    info: 'bg-gray-50 border-gray-400 text-gray-700',
    error: 'bg-red-50 border-red-400 text-red-800',
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">QRコードスキャン</h2>

        <div id={containerId} className="mb-6" />

        <div className="flex gap-3 mb-6">
          {!scanning ? (
            <button
              onClick={startScanner}
              disabled={processing}
              className="flex-1 py-3 bg-[#D4B946] text-white font-bold rounded-xl hover:bg-[#B89D3A] transition-colors disabled:bg-gray-300"
            >
              📷 スキャン開始
            </button>
          ) : (
            <button
              onClick={stopScanner}
              className="flex-1 py-3 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-colors"
            >
              停止
            </button>
          )}
        </div>

        {outcome && (
          <div className={`border-2 rounded-lg p-4 mb-4 ${outcomeColors[outcome.type]}`}>
            <div className="font-bold text-lg">{outcome.message}</div>
            {outcome.detail && <div className="text-sm mt-1">{outcome.detail}</div>}

            {confirmPending && (
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleForceAdmit}
                  disabled={processing}
                  className="flex-1 py-2 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 transition-colors"
                >
                  入場処理する
                </button>
                <button
                  onClick={() => { setConfirmPending(null); setOutcome(null); }}
                  className="flex-1 py-2 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            )}

            {!confirmPending && (
              <button
                onClick={() => { setOutcome(null); startScanner(); }}
                className="mt-3 w-full py-2 bg-white border border-current rounded-lg font-bold hover:bg-gray-50 transition-colors text-sm"
              >
                次をスキャン
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400 text-center">
          来場者のQRコードをカメラに向けてください
        </p>
      </div>
    </div>
  );
}
