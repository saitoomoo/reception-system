import { useState, useEffect, useCallback } from 'react';
import { staffClient } from '@/lib/connect/client';
import { PageType, StaffTicketItem } from './types';
import AdminLogin from './_components/admin-login';
import AdminSidebar from './_components/admin-sidebar';
import AdminHeader from './_components/admin-header';
import ReservationsPage from './_components/reservations-page';
import QrScanner from './_components/qr-scanner';
import ManualAdmit from './_components/manual-admit';

interface Session {
  boothId: string;
  boothName: string;
}

export default function AdminScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [tickets, setTickets] = useState<StaffTicketItem[]>([]);
  const [currentPage, setCurrentPage] = useState<PageType>('reservations');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Try to restore session from cookie on mount
  useEffect(() => {
    staffClient.getStaffSession({})
      .then((res) => {
        if (res.boothId) {
          setSession({ boothId: res.boothId, boothName: res.boothName });
        }
      })
      .catch(() => undefined)
      .finally(() => setSessionLoading(false));
  }, []);

  const fetchTickets = useCallback(async () => {
    if (!session) return;
    try {
      const res = await staffClient.listTicketsByBooth({});
      setTickets(
        res.tickets.map((t) => ({
          ticketId: t.ticketId,
          sequenceInBooth: t.sequenceInBooth,
          receptionNumber: t.receptionNumber,
          nickname: t.nickname,
          participantCount: t.participantCount,
          status: t.status as StaffTicketItem['status'],
          isPriorityCall: t.isPriorityCall,
          createdAt: t.createdAt,
        }))
      );
    } catch {
      // Silently ignore polling errors; UI stays stale until next tick
    }
  }, [session]);

  // Poll every 5 seconds when logged in
  useEffect(() => {
    if (!session) return;
    fetchTickets();
    const id = setInterval(fetchTickets, 5000);
    return () => clearInterval(id);
  }, [session, fetchTickets]);

  const handleLogin = (boothId: string, boothName: string) => {
    setSession({ boothId, boothName });
  };

  const handleLogout = async () => {
    setSession(null);
    setTickets([]);
  };

  const handleCallNext = async (count: number) => {
    await staffClient.callNextTickets({ count });
    await fetchTickets();
  };

  const handleCancelTicket = async (ticketId: string) => {
    await staffClient.cancelTicketByStaff({ ticketId });
    await fetchTickets();
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (!session) {
    return <AdminLogin onLogin={handleLogin} />;
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
        boothName={session.boothName}
        onMenuToggle={() => setIsMenuOpen((prev) => !prev)}
        onLogout={handleLogout}
      />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {currentPage === 'reservations' && (
          <ReservationsPage
            tickets={tickets}
            onCallNext={handleCallNext}
            onCancelTicket={handleCancelTicket}
          />
        )}
        {currentPage === 'qr-scanner' && (
          <QrScanner boothId={session.boothId} />
        )}
        {currentPage === 'manual-admit' && (
          <ManualAdmit />
        )}
      </div>
    </div>
  );
}
