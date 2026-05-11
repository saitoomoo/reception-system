import { BoothType } from '../types';

interface Props {
  loginBooth: BoothType;
  loginPassword: string;
  loginError: string | null;
  onBoothChange: (booth: BoothType) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
}

export default function AdminLogin({
  loginBooth,
  loginPassword,
  loginError,
  onBoothChange,
  onPasswordChange,
  onSubmit,
}: Props) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🛡️</div>
          <h1 className="text-2xl font-bold text-gray-800">スタッフログイン</h1>
          <p className="text-sm text-gray-500 mt-2">担当ブースとパスワードを入力してください</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">担当ブース</label>
            <select
              value={loginBooth}
              onChange={(e) => onBoothChange(e.target.value as BoothType)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-[#D4B946] text-base"
            >
              <option value="horse-race">🏇 馬レース</option>
              <option value="parkour">🤸 パルクール</option>
              <option value="chanbara">⚔️ チャンバラ</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">共有パスワード</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="パスワードを入力"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-[#D4B946] text-base"
            />
          </div>

          {loginError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 text-center">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-[#D4B946] text-white font-bold rounded-xl hover:bg-[#B89D3A] transition-colors text-base"
          >
            ログイン
          </button>
        </form>
      </div>
    </div>
  );
}
