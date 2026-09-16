'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

export function LoginClient() {
  const { openAuth, user } = useAuth();
  useEffect(() => {
    if (!user) openAuth({ tab: 'login' });
  }, [openAuth, user]);
  return (
    <div className="auth-page">
      <h1 className="ds-display ds-display--sm">Sign in</h1>
      <p className="ds-body">Use the dialog to continue.</p>
    </div>
  );
}
