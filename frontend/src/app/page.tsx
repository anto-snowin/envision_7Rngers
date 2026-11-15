import Link from 'next/link';
import {
  AlertIcon,
  ArrowRightIcon,
  PhoneIcon,
  RadarIcon,
  ShieldIcon,
  UsersIcon,
} from '@/components/ui/Icons';
import { LOCATION_INTERVAL_LABEL } from '@/lib/constants';

const CAPABILITIES = [
  {
    icon: RadarIcon,
    title: 'Live position',
    body: `The patient's phone browser reports its own GPS fix every ${LOCATION_INTERVAL_LABEL}. No preset coordinates, no dedicated hardware.`,
  },
  {
    icon: ShieldIcon,
    title: 'Circular geofences',
    body: 'Draw a safe zone around home and as many danger zones as the neighbourhood needs — railway, river, highway, industrial.',
  },
  {
    icon: AlertIcon,
    title: 'Instant alerts',
    body: 'Leaving the safe zone or entering a danger zone pushes an alert to the dashboard over a socket, not a refresh.',
  },
];

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      {/* Ambient lime wash behind the hero. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-64 left-1/2 h-[42rem] w-[72rem] -translate-x-1/2 rounded-full bg-acid-500/8 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 pt-8 pb-24 sm:px-8">
        {/* ------------------------------------------------------------ header */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-acid-500 text-ink-950">
              <RadarIcon className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight text-ink-100">
              Sentinel
            </span>
          </div>

          <nav className="pillbar hidden sm:flex">
            <Link href="/patient/login" className="pill">
              Patient
            </Link>
            <Link href="/caretaker/login" className="pill">
              Caretaker
            </Link>
          </nav>
        </header>

        {/* -------------------------------------------------------------- hero */}
        <section className="pt-20 pb-16 sm:pt-28">
          <p className="eyebrow">Dementia care · GPS geofencing</p>

          <h1 className="mt-5 max-w-3xl text-5xl font-black sm:text-7xl lg:text-[5.5rem]">
            Know they are
            <br />
            <span className="text-acid-500">still safe</span>, not
            <br />
            just still home.
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-400">
            A web platform that turns the patient&apos;s own phone into a tracker and the
            caretaker&apos;s screen into a live map — with zone alerts the moment they matter.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/caretaker/login" className="btn btn-acid btn-lg">
              Caretaker sign in
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <Link href="/patient/login" className="btn btn-ghost btn-lg">
              <PhoneIcon className="h-4 w-4" />
              Patient device
            </Link>
          </div>
        </section>

        {/* ------------------------------------------------------- role cards */}
        <section className="grid gap-4 sm:grid-cols-2">
          <RoleCard
            href="/patient/login"
            icon={<PhoneIcon className="h-5 w-5" />}
            kicker="For the person being cared for"
            title="Patient device"
            body="One screen. Sign in once, keep the page open, and the phone quietly shares its location. A large SOS button is always within reach."
            points={['Minimal single-screen UI', 'Works offline, syncs on reconnect', 'Hold-to-send SOS']}
          />
          <RoleCard
            href="/caretaker/login"
            icon={<UsersIcon className="h-5 w-5" />}
            kicker="For the family member or carer"
            title="Caretaker dashboard"
            body="Live map, zone editor, alert stream and route history — on a phone or a desktop, updating in real time."
            points={['Live map and route trail', 'Safe and danger zone editor', 'Real-time alert feed']}
          />
        </section>

        {/* ------------------------------------------------------ capabilities */}
        <section className="mt-24">
          <h2 className="text-3xl font-extrabold sm:text-4xl">How it works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="panel panel-lit p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-acid-500/12 text-acid-500">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-xl font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-400">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="hairline mt-24 pt-8 text-xs text-ink-500">
          Sentinel is a prototype built for a dementia-care monitoring project. It is not a medical
          device and must not be relied on as the only means of keeping someone safe.
        </footer>
      </div>
    </main>
  );
}

function RoleCard({
  href,
  icon,
  kicker,
  title,
  body,
  points,
}: {
  href: string;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  body: string;
  points: string[];
}) {
  return (
    <Link
      href={href}
      className="panel group p-7 transition-colors hover:border-acid-500/40 focus-visible:border-acid-500/60"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink-100/6 text-acid-500">
          {icon}
        </span>
        <ArrowRightIcon className="h-5 w-5 text-ink-600 transition-colors group-hover:text-acid-500" />
      </div>

      <p className="mt-6 text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">
        {kicker}
      </p>
      <h3 className="mt-2 text-2xl font-extrabold">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-400">{body}</p>

      <ul className="mt-6 space-y-2">
        {points.map((point) => (
          <li key={point} className="flex items-center gap-2.5 text-sm text-ink-300">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-acid-500" />
            {point}
          </li>
        ))}
      </ul>
    </Link>
  );
}
