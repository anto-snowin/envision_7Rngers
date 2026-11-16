'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import Button from '@/components/ui/Button';
import { Field, FormError } from '@/components/ui/Field';
import { PageLoading } from '@/components/ui/Feedback';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Patient sign-in.
 *
 * Bigger type, bigger controls and fewer words than the caretaker form: it is
 * used on a phone, possibly outdoors, by someone with dementia. One field for
 * the identifier, because asking which *kind* of identifier they are about to
 * type is one decision too many.
 */
export default function PatientLoginPage() {
  const { patientLogin, session, isRestoring } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const alreadySignedIn = Boolean(session);

  useEffect(() => {
    if (alreadySignedIn) window.location.replace('/patient/dashboard');
  }, [alreadySignedIn]);

  if (isRestoring || alreadySignedIn) return <PageLoading label="Checking your sign-in…" />;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      await patientLogin(identifier.trim(), password);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not sign in. Please check your connection.'
      );
      setIsPending(false);
    }
  }

  return (
    <AuthShell
      roomy
      eyebrow="Patient device"
      title="Sign in to share your location"
      subtitle="Your carer gave you a code and a password. Keep this page open afterwards so they can see you are safe."
      footer={
        <Link href="/caretaker/login" className="hover:text-ink-100">
          I&apos;m the carer, not the patient
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <FormError message={error} />

        <Field
          label="Your code"
          name="identifier"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="PT-0000-0000"
          hint="You can also use your email address or phone number."
          className="[&_input]:py-4 [&_input]:text-lg [&_input]:tracking-wide"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          required
        />

        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          className="[&_input]:py-4 [&_input]:text-lg"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <Button type="submit" size="lg" className="w-full" isLoading={isPending}>
          Start sharing my location
        </Button>
      </form>
    </AuthShell>
  );
}
