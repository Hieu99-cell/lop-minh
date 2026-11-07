import { cn } from '@/lib/utils';
export function Button({
  className,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  return <button className={cn('button', `button-${variant}`, className)} {...props} />;
}
