import { useState, useEffect } from 'react';
import { BoothType, PageType, Reception, ReceptionStatus, BOOTH_PASSWORDS } from './types';
import AdminLogin from './_components/admin-login';
import AdminSidebar from './_components/admin-sidebar';
import AdminHeader from './_components/admin-header';
import ReservationsPage from './_components/reservations-page';
import BoothSettingsPage from './_components/booth-settings-page';

export default function AdminScreen() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginBooth, setLoginBooth] = useState<BoothType>('horse-race');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggedInBooth, setLoggedInBooth] = useState<BoothType | null>(null);
  const [currentPage, setCurrentPage] = useState<PageType>('reservations-all');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [receptions, setReceptions] = useState<Reception[]>([]);

  useEffect(() => {
    setReceptions([
      {
        id: 1,
        receptionNumber: 'A-015',
        booth: 'horse-race',
        nickname: '山田',
        partySize: 2,
        ages: [25, 28],
        status: 'called',
        is_priority_call: false,
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
        calledAt: new Date(),
      },
      {
        id: 2,
        receptionNumber: 'A-016',
        booth: 'parkour',
        nickname: '佐藤',
        partySize: 1,
        ages: [22],
        status: 'waiting',
        timestamp: new Date(Date.now() - 1000 * 60 * 3),
      },
      {
        id: 3,
        receptionNumber: 'A-017',
        booth: 'horse-race',
        nickname: '鈴木',
        partySize: 3,
        ages: [35, 12, 8],
        guardianName: '鈴木太郎',
        status: 'pending',
        is_priority_call: true,
        timestamp: new Date(Date.now() - 1000 * 60 * 2),
      },
      {
        id: 4,
        receptionNumber: 'A-018',
        booth: 'chanbara',
        nickname: '田中',
        partySize: 2,
        ages: [19, 20],
        status: 'waiting',
        timestamp: new Date(Date.now() - 1000 * 60 * 1),
      },
    ]);
  }, []);

  const handleLogin = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError(null);
    // TODO: LoginAsStaff RPC を呼ぶ
    if (loginPassword === BOOTH_PASSWORDS[loginBooth]) {
      setIsLoggedIn(true);
      setLoggedInBooth(loginBooth);
    } else {
      setLoginError('パスワードが違います');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoggedInBooth(null);
    setLoginPassword('');
    setLoginError(null);
  };

  const handleStatusChange = (id: number, newStatus: ReceptionStatus) => {
    setReceptions((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, status: newStatus };
        if (newStatus === 'called') updated.calledAt = new Date();
        else if (newStatus === 'admitted') updated.admittedAt = new Date();
        return updated;
      })
    );
  };

  const handleCancel = (id: number) => {
    // TODO: CancelTicketByStaff RPC を呼ぶ
    handleStatusChange(id, 'cancelled');
  };

  if (!isLoggedIn) {
    return (
      <AdminLogin
        loginBooth={loginBooth}
        loginPassword={loginPassword}
        loginError={loginError}
        onBoothChange={setLoginBooth}
        onPasswordChange={setLoginPassword}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar
        isOpen={isMenuOpen}
        currentPage={currentPage}
        onMenuClick={(pageId) => {
          setCurrentPage(pageId);
          setIsMenuOpen(false);
        }}
        onClose={() => setIsMenuOpen(false)}
        onLogout={handleLogout}
      />
      <AdminHeader
        currentPage={currentPage}
        loggedInBooth={loggedInBooth}
        onMenuToggle={() => setIsMenuOpen((prev) => !prev)}
        onLogout={handleLogout}
      />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {currentPage === 'booth-settings' ? (
          <BoothSettingsPage />
        ) : (
          <ReservationsPage
            currentPage={currentPage}
            receptions={receptions}
            onStatusChange={handleStatusChange}
            onCancel={handleCancel}
          />
        )}
      </div>
    </div>
  );
}
