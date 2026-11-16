'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import Button from '@/components/ui/Button';
import { Field, FormError } from '@/components/ui/Field';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

export default function CaretakerRegisterPage() {
  const { caretakerRegister } = useAuth();

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFields({});
    setIsPending(true);

    try {
      await caretakerRegister({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
      });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields);
      } else {
        setError('Could not create the account. Please try again.');
      }
      setIsPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Caretaker access"
      title="Create your account"
      subtitle="You will add the people you care for once you are in, and hand each of them a device login."
      footer={
        <>
          Already registered?{' '}
          <Link href="/caretaker/login" className="font-semibold text-acid-500 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormError message={error} />

        <Field
          label="Your name"
          name="name"
          autoComplete="name"
          placeholder="Susan Whitfield"
          value={form.name}
          onChange={set('name')}
          error={fields.name}
          required
        />

        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={set('email')}
          error={fields.email}
          required
        />

        <Field
          label="Phone"
          name="phone"
          autoComplete="tel"
          inputMode="tel"
          placeholder="Optional — shown to the patient"
          value={form.phone}
          onChange={set('phone')}
          error={fields.phone}
        />

        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint="Eight characters or more, including a number."
          value={form.password}
          onChange={set('password')}
          error={fields.password}
          required
        />

        <Button type="submit" className="w-full" isLoading={isPending}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
