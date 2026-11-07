'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { FigureUrl } from '@/types';
type ImageState = { images: Record<string, FigureUrl>; expiresAt: number };
const ImageContext = createContext<{
  images: Record<string, FigureUrl>;
  refresh: () => Promise<boolean>;
} | null>(null);
export function AttemptImageProvider({
  id,
  view,
  initial,
  children,
}: {
  id: string;
  view: 'attempt' | 'result';
  initial: ImageState;
  children: React.ReactNode;
}) {
  const [state, setState] = useState(initial);
  const inflight = useRef<Promise<boolean> | null>(null);
  const refresh = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const task = (async () => {
      try {
        const response = await fetch(`/api/attempts/${id}/images?view=${view}`, {
          cache: 'no-store',
        });
        if (!response.ok) return false;
        const result = await response.json();
        setState(result);
        return true;
      } catch {
        return false;
      }
    })();
    inflight.current = task;
    try {
      return await task;
    } finally {
      inflight.current = null;
    }
  }, [id, view]);
  useEffect(() => {
    const check = () => {
      if (Date.now() > state.expiresAt - 60000) void refresh();
    };
    const timer = setInterval(check, 30000);
    const visible = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [state.expiresAt, refresh]);
  return (
    <ImageContext.Provider value={{ images: state.images, refresh }}>
      {children}
    </ImageContext.Provider>
  );
}
export function useAttemptImage() {
  return useContext(ImageContext);
}
