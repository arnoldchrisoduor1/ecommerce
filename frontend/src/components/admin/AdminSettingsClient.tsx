'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet, adminSend } from '@/lib/admin';
import { Button } from '@/components/ui';

type Settings = {
  email: string;
  password_stored: boolean;
  password_change_requires_2fa: boolean;
};

export function AdminSettingsClient() {
  const { ready, toast } = useAdminUi();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void adminGet<Settings>('/settings').then(setSettings).catch(() => setSettings(null));
  }, [ready]);

  async function requestCode() {
    setBusy(true);
    try {
      const res = await adminSend<{ ok: boolean; sent_to: string }>(
        '/settings/password/code',
        'POST',
        {},
      );
      setCodeSent(true);
      toast(`Verification code sent to ${res.sent_to}`);
    } catch {
      toast('Could not send verification code');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast('New password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      await adminSend('/settings/password', 'PUT', {
        current_password: currentPassword,
        new_password: newPassword,
        code: code.trim(),
      });
      toast('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setCode('');
      setCodeSent(false);
    } catch {
      toast('Password change failed — check current password and code');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Settings">
      <section className="admin-panel" data-testid="admin-settings">
        <h2 className="ds-display ds-display--sm">Account</h2>
        <p className="ds-caption">
          Admin email: <strong>{settings?.email ?? '—'}</strong>
        </p>
        <p className="ds-caption admin-lead">
          Password changes always require a verification code emailed to the admin address.
        </p>

        <form className="admin-form" onSubmit={(e) => void onSubmit(e)} data-testid="admin-password-form">
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={busy}
            data-testid="admin-request-code"
            onClick={() => void requestCode()}
          >
            {codeSent ? 'Resend verification code' : 'Send verification code'}
          </Button>

          <label className="admin-field">
            <span className="ds-label">Current password</span>
            <input
              className="admin-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              data-testid="admin-current-password"
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="admin-field">
            <span className="ds-label">New password</span>
            <input
              className="admin-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              data-testid="admin-new-password"
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="admin-field">
            <span className="ds-label">Verification code</span>
            <input
              className="admin-input"
              inputMode="numeric"
              value={code}
              placeholder="5-digit code from email"
              data-testid="admin-password-code"
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="admin-save-password">
            Update password
          </Button>
        </form>
      </section>
    </AdminShell>
  );
}
