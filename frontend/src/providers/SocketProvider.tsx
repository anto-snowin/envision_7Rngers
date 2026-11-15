'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { closeSocket, getSocket } from '@/lib/socket';
import { useAuth } from './AuthProvider';

interface SocketApi {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketApi>({ socket: null, isConnected: false });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!session?.token) {
      closeSocket();
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const instance = getSocket(session.token);
    setSocket(instance);
    setIsConnected(instance.connected);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    instance.on('connect', onConnect);
    instance.on('disconnect', onDisconnect);

    return () => {
      instance.off('connect', onConnect);
      instance.off('disconnect', onDisconnect);
    };
  }, [session?.token]);

  // Close the connection when the whole provider unmounts (sign-out, tab close)
  // rather than on every token-effect cleanup, which would churn the socket.
  useEffect(() => () => closeSocket(), []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>
  );
}

export function useSocket(): SocketApi {
  return useContext(SocketContext);
}

/**
 * Subscribe to a socket event.
 *
 * The handler is held in a ref so that a caller passing an inline closure does
 * not re-subscribe on every render — which, with a chatty event like
 * `location:update`, would detach and reattach listeners constantly.
 */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket) return;

    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
