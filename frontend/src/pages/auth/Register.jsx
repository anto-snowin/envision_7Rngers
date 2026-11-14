/**
 * Caretaker registration.
 *
 * The password rules are checked live and mirrored from the server's Zod schema,
 * so the user sees what is missing as they type instead of being rejected after
 * submitting.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import AuthLayout from './AuthLayout';
import Button from '../../components/shared/Button';
import { Input, FormError } from '../../components/shared/Form';
import { CheckIcon } from '../../components/shared/Icons';

/** Mirrors `backend/src/validators/auth.validator.js`. */
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { label: 'A lowercase letter', test: (value) => /[a-z]/.test(value) },
  { label: 'An uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { label: 'A number', test: (value) => /[0-9]/.test(value) },
];

export default function Register() {
  const { register } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    organisation: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ruleResults = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(form.password) })),
    [form.password]
  );
  const passwordIsValid = ruleResults.every((rule) => rule.passed);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = {};
    if (form.name.trim().length < 2) errors.name = 'Enter your full name';
    if (!form.email.trim()) errors.email = 'Email is required';
    if (!passwordIsValid) errors.password = 'Password does not meet the requirements';
    if (form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim(),
        organisation: form.organisation.trim(),
      });

      toast.success('Account created', 'Add your first patient to start monitoring.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err.fields) setFieldErrors(err.fields);
      else setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create an account"
      subtitle="Set up a caregiver account to begin monitoring."
      footer={
        <span className="text-surface-500 dark:text-surface-400">
          Already registered?{' '}
          <Link
            to="/login"
            className="font-semibold text-brand-700 hover:underline dark:text-brand-400"
          >
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormError error={formError} />

        <Input
          label="Full name"
          name="name"
          value={form.name}
          onChange={update('name')}
          error={fieldErrors.name}
          autoComplete="name"
          autoFocus
          required
          placeholder="Jane Smith"
        />

        <Input
          label="Email address"
          type="email"
          name="email"
          value={form.email}
          onChange={update('email')}
          error={fieldErrors.email}
          autoComplete="email"
          required
          placeholder="you@example.com"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={update('phone')}
            error={fieldErrors.phone}
            autoComplete="tel"
            placeholder="+44 7700 900000"
          />
          <Input
            label="Organisation"
            name="organisation"
            value={form.organisation}
            onChange={update('organisation')}
            error={fieldErrors.organisation}
            placeholder="Optional"
          />
        </div>

        <div>
          <Input
            label="Password"
            type="password"
            name="password"
            value={form.password}
            onChange={update('password')}
            error={fieldErrors.password}
            autoComplete="new-password"
            required
            placeholder="••••••••"
          />

          {/* Live requirement checklist, shown once the user starts typing. */}
          {form.password ? (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {ruleResults.map((rule) => (
                <li
                  key={rule.label}
                  className={`flex items-center gap-1.5 text-xs ${
                    rule.passed
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-surface-500 dark:text-surface-400'
                  }`}
                >
                  {rule.passed ? (
                    <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50"
                    />
                  )}
                  {rule.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Input
          label="Confirm password"
          type="password"
          name="confirmPassword"
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          error={fieldErrors.confirmPassword}
          autoComplete="new-password"
          required
          placeholder="••••••••"
        />

        <Button type="submit" fullWidth isLoading={isSubmitting} size="lg">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
