import { createBrowserRouter, RouterProvider, Navigate } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import BoothSelectScreen from '@/screens/booth-select';
import BoothDetailScreen from '@/screens/booth-detail';
import CheerScreen from '@/screens/cheer';
import ReserveSelectScreen from '@/screens/reserve-select';
import RegisterScreen from '@/screens/register';
import RegisterCompleteScreen from '@/screens/register/complete';
import LoginScreen from '@/screens/login';
import MypageScreen from '@/screens/mypage';
import WaitingStatusScreen from '@/screens/waiting-status';
import AdminScreen from '@/screens/admin';
import BoothStatusScreen from '@/screens/booth-status';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const router = createBrowserRouter([
  { path: '/', element: <BoothSelectScreen /> },
  { path: '/booths/:boothId', element: <BoothDetailScreen /> },
  { path: '/booths/:boothId/status', element: <BoothStatusScreen /> },
  { path: '/booths/:boothId/cheer', element: <CheerScreen /> },
  { path: '/booths/:boothId/reserve', element: <ReserveSelectScreen /> },
  { path: '/booths/:boothId/reserve/new', element: <RegisterScreen /> },
  { path: '/booths/:boothId/reserve/new/complete', element: <RegisterCompleteScreen /> },
  { path: '/login', element: <LoginScreen /> },
  {
    path: '/mypage',
    element: <AuthGuard><MypageScreen /></AuthGuard>,
  },
  {
    path: '/mypage/waiting',
    element: <AuthGuard><WaitingStatusScreen /></AuthGuard>,
  },
  { path: '/admin', element: <AdminScreen /> },
  { path: '/admin/*', element: <AdminScreen /> },
]);

export default function Router() {
  return <RouterProvider router={router} />;
}
