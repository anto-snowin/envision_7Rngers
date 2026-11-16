'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, UserIcon } from '@/components/ui/Icons';
import { initialsOf } from '@/lib/format';
import { usePatients } from '@/providers/PatientsProvider';
import { PresenceDot } from './PresenceDot';

/**
 * Picks which patient the map, zones and history pages are about.
 *
 * A dropdown rather than a sidebar list: a caretaker typically watches one or
 * two people, so the chooser should cost almost no room on screen.
 */
export function PatientSwitcher() {
  const { patients, selected, select, isLoading } = usePatients();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (isLoading) return <div className="skeleton h-10 w-44" />;

  if (!patients.length) {
    return (
      <span className="badge badge-mute">
        <UserIcon className="h-3.5 w-3.5" />
        No patients yet
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-2.5 rounded-pill border border-ink-100/12 bg-ink-900/70
          py-1.5 pr-3 pl-1.5 text-sm transition-colors hover:border-ink-100/25"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-acid-500 text-[11px] font-bold text-ink-950">
          {initialsOf(selected?.name)}
        </span>
        <span className="max-w-32 truncate font-semibold text-ink-100">
          {selected?.name ?? 'Select patient'}
        </span>
        {selected ? <PresenceDot isOnline={selected.liveStatus.isOnline} /> : null}
        <ArrowRightIcon
          className={`h-3.5 w-3.5 text-ink-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>

      {isOpen ? (
        <div
          role="listbox"
          aria-label="Choose a patient"
          className="panel absolute top-full right-0 z-30 mt-2 w-64 overflow-hidden p-1.5 shadow-lift"
        >
          {patients.map((patient) => (
            <button
              key={patient.id}
              type="button"
              role="option"
              aria-selected={patient.id === selected?.id}
              onClick={() => {
                select(patient.id);
                setIsOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors
                ${
                  patient.id === selected?.id
                    ? 'bg-acid-500/12 text-ink-100'
                    : 'text-ink-300 hover:bg-ink-100/5'
                }`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-100/8 text-[11px] font-bold text-ink-200">
                {initialsOf(patient.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{patient.name}</span>
                <span className="tnum block truncate text-[11px] text-ink-500">
                  {patient.patientCode}
                </span>
              </span>
              <PresenceDot isOnline={patient.liveStatus.isOnline} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
