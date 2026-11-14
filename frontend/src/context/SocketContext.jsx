/**
 * Socket.IO connection for the caretaker dashboard.
 *
 * One socket is shared by every page. Pages subscribe to the events they care
 * about via `useSocketEvent`, which handles listener cleanup so a navigation
 * cannot leave a stale handler updating an unmounted component.
 *
 * Incoming alerts are surfaced as toasts here, once, centrally — otherwise
 * every mounted page would raise its own duplicate toast for the same alert.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { BASE_URL } from '../lib/apiClient';
import { SEVERITY, SOCKET_EVENTS, alertTypeMeta } from '../lib/constants';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  // Bumped on every alert so pages can refetch without wiring their own listener.
  const [lastAlert, setLastAlert] = useState(null);

  useEffect(() => {
    // No token means nothing to authenticate with: tear any socket down.
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return undefined;
    }

    const socket = io(BASE_URL, {
      auth: { token },
      // Start on polling and upgrade: some corporate networks and mobile
      // carriers block raw WebSocket upgrades, and a dashboard that silently
      // never connects is worse than one that connects slowly.
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setConnectionError(null);
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      // An explicit server-side disconnect will not auto-reconnect.
      if (reason === 'io server disconnect') {
        setConnectionError('Disconnected by the server');
      }
    });

    socket.on('connect_error', (err) => {
      setIsConnected(false);
      setConnectionError(err.message || 'Could not connect');
    });

    /**
     * Surface incoming alerts as toasts. Severity decides urgency: critical
     * alerts (SOS, danger zone) are sticky and must be dismissed by hand.
     */
    socket.on(SOCKET_EVENTS.ALERT_NEW, (alert) => {
      setLastAlert(alert);

      const meta = alertTypeMeta(alert.type);
      const isCritical = alert.severity === SEVERITY.CRITICAL;
      const isHigh = alert.severity === SEVERITY.HIGH;

      showToast({
        title: `${alert.patient?.name || 'Patient'} — ${meta.short}`,
        message: alert.message || meta.label,
        variant: isCritical ? 'critical' : isHigh ? 'warning' : 'info',
        icon: meta.icon,
      });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [token, isAuthenticated, showToast]);

  /** Ask the server to stream updates for one patient. */
  const subscribeToPatient = (patientId) =>
    new Promise((resolve) => {
      if (!socketRef.current || !patientId) return resolve({ ok: false });
      socketRef.current.emit(SOCKET_EVENTS.SUBSCRIBE_PATIENT, { patientId }, resolve);
    });

  /** Stop streaming updates for one patient. */
  const unsubscribeFromPatient = (patientId) => {
    if (!socketRef.current || !patientId) return;
    socketRef.current.emit(SOCKET_EVENTS.UNSUBSCRIBE_PATIENT, { patientId });
  };

  const value = useMemo(
    () => ({
      socket: socketRef.current,
      socketRef,
      isConnected,
      connectionError,
      lastAlert,
      subscribeToPatient,
      unsubscribeFromPatient,
    }),
    [isConnected, connectionError, lastAlert]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

/** Access the shared socket. Must be used inside `SocketProvider`. */
export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
}

/**
 * Subscribe to one socket event for the lifetime of a component.
 *
 * The handler is kept in a ref so that passing an inline arrow function does
 * not detach and re-attach the listener on every render.
 *
 * @param {string} event
 * @param {Function} handler
 */
export function useSocketEvent(event, handler) {
  const { socketRef, isConnected } = useSocket();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !event) return undefined;

    const listener = (...args) => handlerRef.current?.(...args);
    socket.on(event, listener);

    return () => socket.off(event, listener);
    // `isConnected` is in the dependency list so the listener is re-attached
    // to a socket that was created after this component mounted.
  }, [event, socketRef, isConnected]);
}
