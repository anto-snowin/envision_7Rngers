/**
 * Shared frame for the login and register pages.
 *
 * Two columns from `lg` up: the form on the left, and a brief explanation of
 * the system on the right. The explanation is hidden on phones rather than
 * stacked above the form — someone signing in on a phone wants the form, not
 * marketing copy.
 */
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../../components/shared/Controls';
import { LocationIcon, ShieldIcon, BellIcon, MapIcon } from '../../components/shared/Icons';

const HIGHLIGHTS = [
  {
    icon: MapIcon,
    title: 'Live location',
    body: 'The patient opens a link on their phone — no app to install — and their position updates every five seconds.',
  },
  {
    icon: ShieldIcon,
    title: 'Intelligent geofencing',
    body: 'Safe zones around home and danger zones over hazards. Alerts fire on the crossing, not continuously.',
  },
  {
    icon: BellIcon,
    title: 'Instant alerts',
    body: 'Left the safe zone, entered a hazard, GPS lost, battery low, or SOS pressed — delivered the moment it happens.',
  },
];

export default function AuthLayout({ title, subtitle, children, footer = null }) {
  return (
    <div className="flex min-h-full">
      {/* ------------------------------------------------------------- form */}
      <div className="flex w-full flex-col px-5 py-8 sm:px-8 lg:w-1/2 lg:px-12">
        <div className="mb-10 flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <LocationIcon className="h-5 w-5" />
            </span>
            <span className="text-sm font-bold text-surface-900 dark:text-surface-50">
              Dementia Care Monitor
            </span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">{title}</h1>
          {subtitle ? (
            <p className="mt-1.5 text-sm text-surface-500 dark:text-surface-400">{subtitle}</p>
          ) : null}

          <div className="mt-7">{children}</div>

          {footer ? <div className="mt-6 text-center text-sm">{footer}</div> : null}
        </div>
      </div>

      {/* --------------------------------------------------------- sidebar */}
      <aside className="relative hidden w-1/2 overflow-hidden bg-brand-700 lg:block dark:bg-brand-950">
        {/* Soft radial wash, kept behind the content. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.22), transparent 55%), radial-gradient(circle at 70% 80%, rgba(45,212,191,0.28), transparent 50%)',
          }}
        />

        <div className="relative flex h-full flex-col justify-center p-12 text-white">
          <h2 className="max-w-md text-3xl font-bold">
            Keep the people you care for safe, without taking away their independence.
          </h2>
          <p className="mt-4 max-w-md text-sm text-brand-100">
            A web-based monitoring system for caregivers looking after elderly people with dementia.
          </p>

          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;

              return (
                <li key={item.title} className="flex max-w-md gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-sm text-brand-100">{item.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
