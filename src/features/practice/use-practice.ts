'use client';
import { useEffect, useRef, useState } from 'react';
import { checkPractice, retryPractice } from './actions';
import type { PracticeFeedback } from '@/types';
export function usePractice(
  id: string,
  initial: Record<string, PracticeFeedback> = {},
  initialChecked: string[] = [],
) {
  const [feedback, setFeedback] = useState(initial);
  const [checked, setChecked] = useState(initialChecked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const guard = useRef(false);
  const mounted = useRef(true);
  const scrollFrame = useRef<number | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    };
  }, []);
  const requests = useRef(new Map<string, { selected: string; key: string }>());
  const check = async (question: string, selected: string[], flush: () => Promise<boolean>) => {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError('');
    try {
      if (!(await flush())) {
        setError('Câu trả lời chưa lưu. Hãy kết nối mạng rồi thử lại.');
        return;
      }
      const value = JSON.stringify(selected);
      let req = requests.current.get(question);
      if (!req || req.selected !== value) {
        req = { selected: value, key: crypto.randomUUID() };
        requests.current.set(question, req);
      }
      const result = await checkPractice(id, question, selected, req.key);
      if (result.feedback) {
        if (!mounted.current) return;
        const position = { left: window.scrollX, top: window.scrollY };
        setFeedback((prev) => ({ ...prev, [question]: result.feedback }));
        setChecked((prev) => (prev.includes(question) ? prev : [...prev, question]));
        scrollFrame.current = requestAnimationFrame(() => {
          if (mounted.current) window.scrollTo({ ...position, behavior: 'instant' });
          scrollFrame.current = null;
        });
      } else setError(result.error || 'Chưa kiểm tra được.');
    } catch {
      setError('Mất kết nối. Thử kiểm tra lại sẽ không ghi trùng kết quả.');
    } finally {
      guard.current = false;
      setBusy(false);
    }
  };
  const retry = async (question: string, clear: () => void) => {
    if (guard.current || !feedback[question]) return;
    guard.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await retryPractice(id, question, feedback[question].check_id);
      if (result.error) setError(result.error);
      else {
        setFeedback((prev) => {
          const next = { ...prev };
          delete next[question];
          return next;
        });
        requests.current.delete(question);
        clear();
      }
    } catch {
      setError('Mất kết nối. Giữ trang mở và thử làm lại.');
    } finally {
      guard.current = false;
      setBusy(false);
    }
  };
  return { feedback, checked, busy, error, check, retry };
}
