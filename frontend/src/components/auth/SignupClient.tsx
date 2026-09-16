'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

export function SignupClient() {
  const { openAuth, user } = useAuth();
  useEffect(() => {
    if (!user) openAuth({ tab: 'signup' });
  }, [openAuth, user]);
  return (
    <div className="auth-page">
      <h1 className="ds-display ds-display--sm">Create account</h1>
      <p className="ds-body">Use the dialog to continue.</p>
    </div>
  );
}
