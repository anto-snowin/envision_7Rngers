/**
 * Caretaker sign-in.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthLayout from './AuthLayout';
import Button from '../../components/shared/Button';
import { Input, FormError } from '../../components/shared/Form';

export default function Login() {
  const { login, sessionMessage, clearSessionMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If the guard redirected us here, go back to the attempted page afterwards.
  const redirectTo = location.state?.from || '/dashboard';

  // Surface "your session ended" once, then clear it so it does not reappear.
  useEffect(() => {
    if (sessionMessage) {
      setFormError(sessionMessage);
      clearSessionMessage();
    }
  }, [sessionMessage, clearSessionMessage]);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    // Cheap client-side check so an empty submit does not need a round trip.
    const errors = {};
    if (!form.email.trim()) errors.email = 'Email is required';
    if (!form.password) errors.password = 'Password is required';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await login({ email: form.email.trim(), password: form.password });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      // The API returns the same message for an unknown email and a wrong
      // password, so it is shown as a form-level error rather than against
      // one field.
      if (err.fields) setFieldErrors(err.fields);
      else setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your caregiving dashboard."
      footer={
        <span className="text-surface-500 dark:text-surface-400">
          Need an account?{' '}
          <Link
            to="/register"
            className="font-semibold text-brand-700 hover:underline dark:text-brand-400"
          >
            Create one
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormError error={formError} />

        <Input
          label="Email address"
          type="email"
          name="email"
          value={form.email}
          onChange={update('email')}
          error={fieldErrors.email}
          autoComplete="email"
          autoFocus
          required
          placeholder="you@example.com"
        />

        <Input
          label="Password"
          type="password"
          name="password"
          value={form.password}
          onChange={update('password')}
          error={fieldErrors.password}
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />

        <Button type="submit" fullWidth isLoading={isSubmitting} size="lg">
          Sign in
        </Button>
      </form>

      {/* The seeded demo account, shown only in development. */}
      {import.meta.env.DEV ? (
        <div className="mt-5 rounded-xl bg-surface-100 p-3 text-xs text-surface-600 dark:bg-surface-800 dark:text-surface-300">
          <p className="font-semibold">Demo account (after npm run seed)</p>
          <p className="mt-1 tabular">caretaker@demo.com · Demo1234</p>
        </div>
      ) : null}
    </AuthLayout>
  );
}
