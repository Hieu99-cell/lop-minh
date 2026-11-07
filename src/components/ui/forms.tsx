'use client';
import { useFormStatus } from 'react-dom';
import { Button } from './button';
export function Submit({
  children = 'Lưu thay đổi',
  disabled = false,
  variant = 'primary',
}: {
  children?: React.ReactNode;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <Button variant={variant} disabled={pending || disabled}>
      {pending ? 'Đang xử lý…' : children}
    </Button>
  );
}
export function ConfirmButton({
  children,
  message,
}: {
  children: React.ReactNode;
  message: string;
}) {
  return (
    <Button
      variant="danger"
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
export function CopyButton({ value, label = 'Sao chép link' }: { value: string; label?: string }) {
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          alert('Đã sao chép đường link');
        } catch {
          prompt('Sao chép đường link:', value);
        }
      }}
    >
      {label}
    </Button>
  );
}
