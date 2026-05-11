import { useState, useEffect } from 'react';

interface AuthState {
  receptionNumber: string | null;
  visitorId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    receptionNumber: null,
    visitorId: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const storedNumber = localStorage.getItem('reception_number');
    const storedVisitorId = localStorage.getItem('visitor_id');
    setAuthState(
      storedNumber
        ? { receptionNumber: storedNumber, visitorId: storedVisitorId, isAuthenticated: true, isLoading: false }
        : { receptionNumber: null, visitorId: null, isAuthenticated: false, isLoading: false },
    );
  }, []);

  const login = (receptionNumber: string, pinHash: string, visitorId?: string) => {
    localStorage.setItem('reception_number', receptionNumber);
    localStorage.setItem('pin_hash', pinHash);
    if (visitorId) localStorage.setItem('visitor_id', visitorId);
    setAuthState({ receptionNumber, visitorId: visitorId ?? null, isAuthenticated: true, isLoading: false });
  };

  const logout = () => {
    localStorage.removeItem('reception_number');
    localStorage.removeItem('pin_hash');
    localStorage.removeItem('visitor_id');
    setAuthState({ receptionNumber: null, visitorId: null, isAuthenticated: false, isLoading: false });
  };

  return { ...authState, login, logout };
};
