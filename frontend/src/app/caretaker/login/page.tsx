'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import Button from '@/components/ui/Button';
import { Field, FormError } from '@/components/ui/Field';
import { PageLoading } from '@/components/ui/Feedback';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

export default function CaretakerLoginPage() {
  const { caretakerLogin, session, isRestoring } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  /**
   * Already signed in, so skip the form. `router.replace` lives in the auth
   * provider's login path; here the redirect is for someone arriving at /login
   * with a live session, e.g. from a bookmark.
   */
  const alreadySignedIn = Boolean(session);

  useEffect(() => {
    if (alreadySignedIn) window.location.replace('/caretaker/dashboard');
  }, [alreadySignedIn]);

  if (isRestoring || alreadySignedIn) return <PageLoading label="Checking your session…" />;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFields({});
    setIsPending(true);

    try {
      await caretakerLogin(email.trim(), password);
      // No success state: the provider navigates to the dashboard.
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields);
      } else {
        setError('Could not sign in. Please try again.');
      }
      setIsPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Caretaker access"
      title={
        <>
          Sign in to
          <br />
          <span className="text-acid-500">monitor</span>
        </>
      }
      subtitle="Live location, zone alerts and history for everyone in your care."
      footer={
        <>
          No account yet?{' '}
          <Link href="/caretaker/register" className="font-semibold text-acid-500 hover:underline">
            Create one
          </Link>
          <span className="mx-2 text-ink-700">·</span>
          <Link href="/patient/login" className="hover:text-ink-100">
            I&apos;m the patient
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormError message={error} />

        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fields.email}
          required
        />

        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fields.password}
          required
        />

        <Button type="submit" className="w-full" isLoading={isPending}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
