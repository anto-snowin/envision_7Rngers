'use client';

import { AuthProvider } from './AuthProvider';
import { SocketProvider } from './SocketProvider';
import { ToastProvider } from './ToastProvider';

/**
 * Client-side provider stack, mounted once from the root layout.
 *
 * Order matters: the socket is opened with the session's token, so Auth must
 * resolve first. Toast sits outermost so a provider further in can report a
 * failure through it.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <SocketProvider>{children}</SocketProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
