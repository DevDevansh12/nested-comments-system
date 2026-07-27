'use client';

import { useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { initializeAuth } from '@/store/slices/authSlice';

function AuthInitializer() {
  const initialized = useRef(false);

  useEffect(() => {
    // Guard: only run once, only on the client
    if (initialized.current) return;
    initialized.current = true;
    store.dispatch(initializeAuth());
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <AuthInitializer />
      {children}
    </Provider>
  );
}
