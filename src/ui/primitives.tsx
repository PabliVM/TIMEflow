'use client';

import { useEffect, useId } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Icon } from './icons';
import type { IconName } from './icons';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accentfg hover:bg-accent/90',
  secondary: 'bg-surface2 text-fg hover:bg-line/70',
  ghost: 'text-fg hover:bg-surface2',
  danger: 'bg-danger text-white hover:bg-danger/90',
};

export function Button({
  variant = 'secondary', icon, className, children, ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        className,
      )}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon, label, className, variant = 'ghost', size = 20, ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; variant?: Variant; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...p}
      className={cx('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40', VARIANT[variant], className)}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, className, size = 'md',
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className={cx('flex rounded-xl bg-surface2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 whitespace-nowrap rounded-lg px-3 font-semibold transition-colors',
            size === 'sm' ? 'min-h-9 text-xs' : 'min-h-10 text-sm',
            o.value === value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: (id: string) => ReactNode; hint?: string; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const inputCls =
  'min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-base text-fg outline-none transition-colors focus:border-accent sm:text-sm';

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, className)} />;

export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx(inputCls, 'pr-8', className)}>
    {children}
  </select>
);

export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(inputCls, 'min-h-20 py-2.5', className)} />
);

export function Sheet({
  open, onClose, title, children, footer, wide,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 animate-fade" onClick={onClose} />
      <div
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl animate-sheet md:rounded-3xl',
          wide ? 'md:max-w-2xl' : 'md:max-w-lg',
        )}
      >
        <div className="flex items-center gap-2 border-b border-line py-2 pl-5 pr-2">
          <h2 className="flex-1 truncate font-display text-lg font-semibold">{title}</h2>
          <IconButton icon="x" label="Cerrar" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="flex gap-2 border-t border-line px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 rounded-2xl border border-line bg-surface p-4', className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {title && <h3 className="flex-1 font-display text-base font-semibold">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ProgressBar({ ratio, color }: { ratio: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export const Dot = ({ color, className }: { color: string; className?: string }) => (
  <span className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)} style={{ background: color }} />
);

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}
