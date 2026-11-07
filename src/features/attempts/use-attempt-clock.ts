'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAttemptClock } from './actions';
import type { AttemptData } from '@/types';
export function useAttemptClock(attempt: AttemptData) {
  const router = useRouter();
  const [remaining, setRemaining] = useState<number | null>(
    attempt.deadline === null
      ? null
      : Math.max(
          0,
          Math.floor((Date.parse(attempt.deadline) - Date.parse(attempt.server_now)) / 1000),
        ),
  );
  const [message, setMessage] = useState('');
  const [timingRevision, setTimingRevision] = useState(attempt.timing_revision || 0);
  const anchor = useRef({
    deadline: attempt.deadline,
    serverNow: attempt.server_now,
    received: 0,
    revision: attempt.timing_revision || 0,
  });
  const inflight = useRef(false),
    alive = useRef(true),
    nextRetry = useRef(0);
  const refresh = useCallback(async () => {
    if (inflight.current || performance.now() < nextRetry.current) return;
    inflight.current = true;
    try {
      const result = await getAttemptClock(attempt.id);
      if (!alive.current) return;
      if (!result.data) {
        setMessage('Chưa đồng bộ được lịch. Giữ trang mở và kiểm tra kết nối.');
        nextRetry.current = performance.now() + 3000;
        return;
      }
      if (result.data.status !== 'in_progress') {
        router.replace(`/results/${attempt.id}`);
        return;
      }
      const changed = result.data.timing_revision !== anchor.current.revision;
      anchor.current = {
        deadline: result.data.deadline,
        serverNow: result.data.server_now,
        received: performance.now(),
        revision: result.data.timing_revision,
      };
      setRemaining(
        result.data.deadline === null
          ? null
          : Math.max(
              0,
              Math.floor(
                (Date.parse(result.data.deadline) - Date.parse(result.data.server_now)) / 1000,
              ),
            ),
      );
      setMessage(changed ? 'Lịch làm bài đã được giáo viên cập nhật.' : '');
      setTimingRevision(result.data.timing_revision);
    } catch {
      if (alive.current) setMessage('Chưa đồng bộ được lịch. Giữ trang mở và kiểm tra kết nối.');
      nextRetry.current = performance.now() + 3000;
    } finally {
      inflight.current = false;
    }
  }, [attempt.id, router]);
  useEffect(() => {
    alive.current = true;
    anchor.current.received = performance.now();
    const tick = setInterval(() => {
      const a = anchor.current;
      if (a.deadline === null) return;
      const left = Math.max(
        0,
        Math.floor(
          (Date.parse(a.deadline) - Date.parse(a.serverNow)) / 1000 -
            (performance.now() - a.received) / 1000,
        ),
      );
      setRemaining(left);
      // A stale browser clock must never submit an attempt that was extended.
      // The database alone expires the attempt after checking its latest deadline.
      if (left === 0) void refresh();
    }, 1000);
    const poll = setInterval(() => void refresh(), 10000);
    const online = () => void refresh(),
      visible = () => {
        if (document.visibilityState === 'visible') void refresh();
      };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive.current = false;
      clearInterval(tick);
      clearInterval(poll);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  return { remaining, message, timingRevision, refreshClock: refresh };
}
