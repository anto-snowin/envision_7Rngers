import Link from 'next/link';
import { RadarIcon } from '@/components/ui/Icons';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-acid-500/12 text-acid-500">
          <RadarIcon className="h-6 w-6" />
        </span>
        <p className="eyebrow mt-6">Error 404</p>
        <h1 className="mt-3 text-5xl font-black">Nothing here</h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
          That page does not exist. If you were following a tracking link, ask your carer to check
          it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/caretaker/dashboard" className="btn btn-acid">
            Caretaker dashboard
          </Link>
          <Link href="/patient/login" className="btn btn-ghost">
            Patient sign-in
          </Link>
        </div>
      </div>
    </main>
  );
}
