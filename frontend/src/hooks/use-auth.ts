import { useState, useEffect } from 'react';

interface AuthState {
  receptionNumber: string | null;
  isAuthenticated: boolean;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    receptionNumber: null,
    isAuthenticated: false,
  });

  useEffect(() => {
    const stored = localStorage.getItem('reception_number');
    if (stored) {
      setAuthState({ receptionNumber: stored, isAuthenticated: true });
    }
  }, []);

  const login = (receptionNumber: string, pinHash: string) => {
    localStorage.setItem('reception_number', receptionNumber);
    localStorage.setItem('pin_hash', pinHash);
    setAuthState({ receptionNumber, isAuthenticated: true });
  };

  const logout = () => {
    localStorage.removeItem('reception_number');
    localStorage.removeItem('pin_hash');
    setAuthState({ receptionNumber: null, isAuthenticated: false });
  };

  return { ...authState, login, logout };
};
