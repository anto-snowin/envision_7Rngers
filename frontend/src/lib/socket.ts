/**
 * Socket.IO client singleton.
 *
 * One connection per tab, shared by every page, created lazily once a token
 * exists. The token travels in the handshake `auth` payload rather than a query
 * string so it never lands in server access logs.
 */
'use client';

import { io, type Socket } from 'socket.io-client';
import { API_BASE } from './api';

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getSocket(token: string): Socket {
  // A different token means a different session: tear the old one down so the
  // server does not keep a stale room membership for the previous identity.
  if (socket && currentToken !== token) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    currentToken = token;
    socket = io(API_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      timeout: 12_000,
    });
  }

  return socket;
}

export function closeSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  currentToken = null;
}
