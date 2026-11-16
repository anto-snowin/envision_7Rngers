import Link from 'next/link';
import { RadarIcon } from '@/components/ui/Icons';

/**
 * Shared frame for the sign-in screens.
 *
 * Both roles get the same frame so the platform reads as one system, but the
 * patient screen passes a larger `size` — it is used one-handed, outdoors, by
 * someone who may be struggling.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  roomy = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  roomy?: boolean;
}) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[30rem] w-[52rem] -translate-x-1/2 rounded-full bg-acid-500/8 blur-3xl"
      />

      <div className={`relative w-full ${roomy ? 'max-w-md' : 'max-w-sm'}`}>
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-acid-500 text-ink-950">
            <RadarIcon className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight text-ink-100">
            Sentinel
          </span>
        </Link>

        <div className="panel panel-lit p-7">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className={`mt-3 font-black ${roomy ? 'text-4xl' : 'text-3xl'}`}>{title}</h1>
          {subtitle ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-400">{subtitle}</p>
          ) : null}

          <div className="mt-7">{children}</div>
        </div>

        {footer ? <div className="mt-6 text-center text-sm text-ink-400">{footer}</div> : null}
      </div>
    </main>
  );
}
