'use client';
import Form from 'next/form';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from './button';

export function FilterForm({
  action,
  children,
  label = 'Tìm kiếm',
}: {
  action: string;
  children: React.ReactNode;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Form
      action={action}
      className="filter-bar"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        for (const [key, value] of new FormData(event.currentTarget))
          if (typeof value === 'string') params.append(key, value);
        startTransition(() => router.push(`${action}?${params}`));
      }}
    >
      {children}
      <Button variant="secondary" disabled={pending}>
        {pending ? 'Đang tải…' : label}
      </Button>
    </Form>
  );
}
