'use client';
import { useEffect } from 'react';
import { browserDb } from '@/lib/supabase/browser';
import { definitiveAuthFailure } from '@/lib/auth/errors';
import { safeNext } from '@/lib/auth/redirect';
export function SessionSync({ userId }: { userId: string }) {
  useEffect(() => {
    const client = browserDb();
    let stopped = false,
      inflight = false;
    const leave = () => {
      if (!stopped && !window.location.pathname.startsWith('/auth'))
        window.location.replace(
          '/auth?' +
            new URLSearchParams({
              reason: 'expired',
              next: safeNext(window.location.pathname + window.location.search),
            }),
        );
    };
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') leave();
      if (event === 'SIGNED_IN' && session?.user.id !== userId && !stopped)
        window.location.reload();
    });
    const verify = async () => {
      if (inflight || !navigator.onLine || document.visibilityState !== 'visible') return;
      inflight = true;
      try {
        const {
          data: { user },
          error,
        } = await client.auth.getUser();
        if (stopped) return;
        if (error) {
          if (definitiveAuthFailure(error)) leave();
          return;
        }
        if (!user) leave();
        else if (user.id !== userId) window.location.reload();
      } catch {
        /* Network errors keep the SDK cookie and current page. */
      } finally {
        inflight = false;
      }
    };
    const check = () => void verify();
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      subscription.unsubscribe();
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [userId]);
  return null;
}
