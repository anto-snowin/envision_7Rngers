/**
 * Account settings: profile, appearance, password and active sessions.
 */
import { useState } from 'react';
import { authApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useApi';
import PageHeader, { PageContainer } from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import { Input, Checkbox, FormError } from '../../components/shared/Form';
import { ConfirmDialog } from '../../components/shared/Modal';
import { SunIcon, MoonIcon, MonitorIcon, LogoutIcon } from '../../components/shared/Icons';
import { formatRelativeTime, formatDateTime } from '../../lib/format';

const THEME_CHOICES = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'Match device', icon: MonitorIcon },
];

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const { toast } = useToast();

  const sessions = useFetch(() => authApi.sessions(), []);

  // ------------------------------------------------------------------ profile

  const [profile, setProfile] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    organisation: user?.organisation || '',
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [profileError, setProfileError] = useState(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const saveProfile = async (event) => {
    event.preventDefault();

    if (profile.name.trim().length < 2) {
      setProfileErrors({ name: 'Enter your name' });
      return;
    }

    setIsSavingProfile(true);
    setProfileError(null);

    try {
      const { data } = await authApi.updateProfile({
        name: profile.name.trim(),
        phone: profile.phone.trim(),
        organisation: profile.organisation.trim(),
      });
      updateUser(data.user);
      toast.success('Profile updated');
    } catch (err) {
      if (err.fields) setProfileErrors(err.fields);
      else setProfileError(err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ----------------------------------------------------------------- password

  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordError, setPasswordError] = useState(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const savePassword = async (event) => {
    event.preventDefault();

    const errors = {};
    if (!passwords.currentPassword) errors.currentPassword = 'Enter your current password';
    if (passwords.newPassword.length < 8) {
      errors.newPassword = 'At least 8 characters, with upper case, lower case and a number';
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length) {
      setPasswordErrors(errors);
      return;
    }

    setIsSavingPassword(true);
    setPasswordError(null);

    try {
      const { data } = await authApi.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      toast.success('Password changed', data.message);
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      sessions.refetch();
    } catch (err) {
      if (err.fields) setPasswordErrors(err.fields);
      else setPasswordError(err.message);
    } finally {
      setIsSavingPassword(false);
    }
  };

  // ----------------------------------------------------------- notifications

  const [prefs, setPrefs] = useState({
    alertSound: user?.preferences?.alertSound ?? true,
    emailAlerts: user?.preferences?.emailAlerts ?? false,
  });

  const savePreference = async (key, value) => {
    setPrefs((current) => ({ ...current, [key]: value }));

    try {
      const { data } = await authApi.updateProfile({ preferences: { [key]: value } });
      updateUser(data.user);
    } catch (err) {
      // Roll the toggle back so the UI never claims a setting that did not save.
      setPrefs((current) => ({ ...current, [key]: !value }));
      toast.error('Could not save that setting', err.message);
    }
  };

  // --------------------------------------------------------------- sessions

  const [revoking, setRevoking] = useState(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const revokeSession = async () => {
    if (!revoking) return;

    setIsRevoking(true);
    try {
      await authApi.revokeSession(revoking.sessionId);
      toast.success('Device signed out');
      setRevoking(null);
      sessions.refetch();
    } catch (err) {
      toast.error('Could not sign that device out', err.message);
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Your account, appearance and signed-in devices." />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardHeader title="Your details" subtitle="Shown only to you." />

          <form onSubmit={saveProfile} className="space-y-4" noValidate>
            <FormError error={profileError} />

            <Input
              label="Full name"
              value={profile.name}
              onChange={(event) => {
                setProfile({ ...profile, name: event.target.value });
                setProfileErrors({});
              }}
              error={profileErrors.name}
              required
            />

            <Input
              label="Email address"
              value={user?.email || ''}
              disabled
              help="Your email is your sign-in and cannot be changed here."
            />

            <Input
              label="Phone"
              type="tel"
              value={profile.phone}
              onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
              error={profileErrors.phone}
            />

            <Input
              label="Organisation"
              value={profile.organisation}
              onChange={(event) => setProfile({ ...profile, organisation: event.target.value })}
              error={profileErrors.organisation}
            />

            <Button type="submit" isLoading={isSavingProfile}>
              Save details
            </Button>
          </form>
        </Card>

        {/* Appearance + notifications */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Appearance" subtitle="How the dashboard looks on this device." />

            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
              {THEME_CHOICES.map((choice) => {
                const Icon = choice.icon;
                const isActive = preference === choice.value;

                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setPreference(choice.value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-3.5 text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200'
                        : 'border-surface-200 text-surface-600 hover:bg-surface-100 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {choice.label}
                  </button>
                );
              })}
            </div>
            <p className="help-text">The theme is stored in this browser, not on your account.</p>
          </Card>

          <Card>
            <CardHeader title="Alert notifications" />

            <div className="space-y-3">
              <Checkbox
                label="Play a sound for critical alerts"
                description="SOS presses and danger zone entries."
                checked={prefs.alertSound}
                onChange={(event) => savePreference('alertSound', event.target.checked)}
              />
              <Checkbox
                label="Email me about alerts"
                description="Not yet available — email delivery is not configured in this build."
                checked={prefs.emailAlerts}
                disabled
                onChange={(event) => savePreference('emailAlerts', event.target.checked)}
              />
            </div>
          </Card>
        </div>

        {/* Password */}
        <Card>
          <CardHeader
            title="Change password"
            subtitle="Changing it signs out every other device."
          />

          <form onSubmit={savePassword} className="space-y-4" noValidate>
            <FormError error={passwordError} />

            <Input
              label="Current password"
              type="password"
              value={passwords.currentPassword}
              onChange={(event) => {
                setPasswords({ ...passwords, currentPassword: event.target.value });
                setPasswordErrors({});
              }}
              error={passwordErrors.currentPassword}
              autoComplete="current-password"
              required
            />
            <Input
              label="New password"
              type="password"
              value={passwords.newPassword}
              onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
              error={passwordErrors.newPassword}
              autoComplete="new-password"
              help="At least 8 characters, with an upper case letter, a lower case letter and a number."
              required
            />
            <Input
              label="Confirm new password"
              type="password"
              value={passwords.confirmPassword}
              onChange={(event) =>
                setPasswords({ ...passwords, confirmPassword: event.target.value })
              }
              error={passwordErrors.confirmPassword}
              autoComplete="new-password"
              required
            />

            <Button type="submit" isLoading={isSavingPassword}>
              Change password
            </Button>
          </form>
        </Card>

        {/* Sessions */}
        <Card>
          <CardHeader
            title="Signed-in devices"
            subtitle="Sign out anywhere you do not recognise."
            action={
              <Button variant="ghost" size="sm" onClick={sessions.refetch}>
                Refresh
              </Button>
            }
          />

          {sessions.isLoading && !sessions.data ? (
            <div className="space-y-2">
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
            </div>
          ) : (
            <ul className="divide-y divide-surface-100 dark:divide-surface-800">
              {(sessions.data?.sessions || []).map((session) => (
                <li key={session.sessionId} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-surface-900 dark:text-surface-100">
                      {describeUserAgent(session.userAgent)}
                      {session.isCurrent ? (
                        <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                          This device
                        </span>
                      ) : null}
                    </p>
                    <p
                      className="text-xs text-surface-500 dark:text-surface-400"
                      title={formatDateTime(session.lastActivityAt)}
                    >
                      Active {formatRelativeTime(session.lastActivityAt)}
                      {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                    </p>
                  </div>

                  {!session.isCurrent ? (
                    <Button variant="ghost" size="sm" onClick={() => setRevoking(session)}>
                      Sign out
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <Button
            variant="secondary"
            fullWidth
            className="mt-4"
            onClick={logout}
            leftIcon={<LogoutIcon className="h-4 w-4" />}
          >
            Sign out of this device
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        onConfirm={revokeSession}
        isPending={isRevoking}
        title="Sign out this device?"
        confirmLabel="Sign out device"
        message="That device will need to sign in again. Monitoring and alerts are not affected."
      />
    </PageContainer>
  );
}

/**
 * Turn a user-agent string into something readable.
 *
 * Deliberately crude — it only needs to help someone recognise their own
 * devices in the list, not to be an accurate parser.
 */
function describeUserAgent(userAgent) {
  if (!userAgent) return 'Unknown device';

  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Safari\//.test(userAgent)
        ? 'Safari'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : 'Browser';

  const platform = /Windows/.test(userAgent)
    ? 'Windows'
    : /Macintosh|Mac OS/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';

  return platform ? `${browser} on ${platform}` : browser;
}
