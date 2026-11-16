'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useThrottledCallback } from '@/hooks/useApi';
import { patients as patientsApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';
import { SOCKET_EVENTS } from '@/lib/constants';
import type { LocationUpdateEvent, Patient, PatientChangedEvent, PresenceEvent } from '@/lib/types';
import { useSocketEvent } from './SocketProvider';

const SELECTION_KEY = 'sentinel.selectedPatient';

interface PatientsApi {
  patients: Patient[];
  selected: Patient | null;
  selectedId: string | null;
  select: (patientId: string) => void;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  /** Replace one patient in the list after an edit, without a refetch. */
  applyPatient: (patient: Patient) => void;
}

const PatientsContext = createContext<PatientsApi | null>(null);

/**
 * Loads the caretaker's patients once and keeps them live.
 *
 * Every dashboard page needs the same list and the same "which patient am I
 * looking at" answer, so both live here rather than being refetched per page.
 *
 * Socket payloads are merged into the cached list in place. A refetch per
 * `location:update` would be the obvious alternative and it is what the first
 * version of this app did — with several patients reporting it generated enough
 * traffic from an idle dashboard to trip the API's own rate limiter. The
 * payload already carries everything the list row displays.
 */
export function PatientsProvider({ children }: { children: React.ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    patientsApi
      .list()
      .then((list) => {
        if (controller.signal.aborted) return;
        setPatients(list);
        setError(null);

        // Restore the previous selection when it still exists, otherwise fall
        // back to the first patient so the map is never pointlessly empty.
        setSelectedId((current) => {
          if (current && list.some((patient) => patient.id === current)) return current;

          let stored: string | null = null;
          try {
            stored = window.localStorage.getItem(SELECTION_KEY);
          } catch {
            /* storage unavailable */
          }

          if (stored && list.some((patient) => patient.id === stored)) return stored;
          return list[0]?.id ?? null;
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof ApiError ? caught.message : 'Could not load your patients.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [tick]);

  const select = useCallback((patientId: string) => {
    setSelectedId(patientId);
    try {
      window.localStorage.setItem(SELECTION_KEY, patientId);
    } catch {
      /* storage unavailable; the selection still holds for this session */
    }
  }, []);

  const applyPatient = useCallback((patient: Patient) => {
    setPatients((current) =>
      current.some((row) => row.id === patient.id)
        ? current.map((row) => (row.id === patient.id ? patient : row))
        : [patient, ...current]
    );
  }, []);

  /* ----------------------------------------------- live merges, no refetch --- */

  useSocketEvent<LocationUpdateEvent>(SOCKET_EVENTS.LOCATION_UPDATE, (event) => {
    setPatients((current) =>
      current.map((patient) =>
        patient.id === event.patientId
          ? {
              ...patient,
              liveStatus: {
                ...patient.liveStatus,
                isOnline: true,
                latitude: event.latitude,
                longitude: event.longitude,
                accuracy: event.accuracy,
                batteryLevel: event.batteryLevel ?? patient.liveStatus.batteryLevel,
                isCharging: event.isCharging ?? patient.liveStatus.isCharging,
                zoneState: event.zoneState,
                insideSafeZone: event.insideSafeZone,
                dangerZone: event.dangerZone,
                distanceFromSafeZone: event.distanceFromSafeZone,
                lastSeenAt: new Date().toISOString(),
                recordedAt: event.recordedAt,
              },
            }
          : patient
      )
    );
  });

  useSocketEvent<PresenceEvent>(SOCKET_EVENTS.PRESENCE_UPDATE, (event) => {
    setPatients((current) =>
      current.map((patient) => {
        if (patient.id !== event.patientId) return patient;

        /**
         * A socket disconnect is not the same as an offline patient — the phone
         * may just be switching networks — so `socketConnected: false` events
         * carry no `isOnline` and must not flip the indicator.
         */
        const isOnline =
          typeof event.isOnline === 'boolean' ? event.isOnline : patient.liveStatus.isOnline;

        return {
          ...patient,
          liveStatus: {
            ...patient.liveStatus,
            isOnline,
            batteryLevel: event.batteryLevel ?? patient.liveStatus.batteryLevel,
            isCharging: event.isCharging ?? patient.liveStatus.isCharging,
            lastSeenAt: event.lastSeenAt ?? patient.liveStatus.lastSeenAt,
          },
        };
      })
    );
  });

  // A created or deleted patient changes the list itself, which the cached
  // payload cannot describe — that one does need a refetch, throttled.
  const throttledRefresh = useThrottledCallback(refresh, 4000);
  useSocketEvent<PatientChangedEvent>(SOCKET_EVENTS.PATIENT_CHANGED, throttledRefresh);

  const selected = useMemo(
    () => patients.find((patient) => patient.id === selectedId) ?? null,
    [patients, selectedId]
  );

  const value = useMemo<PatientsApi>(
    () => ({
      patients,
      selected,
      selectedId,
      select,
      isLoading,
      error,
      refresh,
      applyPatient,
    }),
    [patients, selected, selectedId, select, isLoading, error, refresh, applyPatient]
  );

  return <PatientsContext.Provider value={value}>{children}</PatientsContext.Provider>;
}

export function usePatients(): PatientsApi {
  const context = useContext(PatientsContext);
  if (!context) throw new Error('usePatients must be used inside <PatientsProvider>');
  return context;
}
