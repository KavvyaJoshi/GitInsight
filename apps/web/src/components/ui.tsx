import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, Eye, EyeOff, Info, Loader2 } from 'lucide-react';
import type { Role, User } from '../lib/api';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white',
  secondary:
    'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100',
  danger: 'border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-11 px-5 text-[15px]' };

export function buttonClass(variant: Variant = 'primary', size: Size = 'md') {
  return `inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]}`;
}

export function Button({
  variant,
  size,
  loading,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={`${buttonClass(variant, size)} ${className}`} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const inputBase =
  'h-10 w-full rounded-md border bg-white px-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-4 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500';
const inputState = (invalid: boolean) =>
  invalid
    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15'
    : 'border-zinc-300 focus:border-zinc-900 focus:ring-zinc-900/10 dark:border-zinc-700 dark:focus:border-zinc-400 dark:focus:ring-white/10';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode; trailing?: ReactNode };

export function Field({ label, error, hint, trailing, id, className = '', ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`${inputBase} ${inputState(Boolean(error))} ${trailing ? 'pr-10' : ''} ${className}`}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-[13px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : (
        hint && (
          <div id={`${inputId}-hint`} className="text-[13px] text-zinc-500">
            {hint}
          </div>
        )
      )}
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="rounded p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      }
    />
  );
}

export function Alert({ tone = 'error', title, children }: { tone?: 'error' | 'info'; title?: string; children: ReactNode }) {
  const Icon = tone === 'error' ? AlertCircle : Info;
  const styles =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200'
      : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg border px-3.5 py-3 text-sm ${styles}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? 'opacity-90' : ''}>{children}</div>
      </div>
    </div>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const admin = role === 'admin';
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${
        admin
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300'
          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
      }`}
    >
      {admin ? 'Admin' : 'Member'}
    </span>
  );
}

export function initials(user: Pick<User, 'name' | 'email'>): string {
  const source = user.name.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Avatar({ user, size = 'md' }: { user: Pick<User, 'name' | 'email'>; size?: 'md' | 'lg' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-emerald-400 to-teal-600 font-medium text-white ${
        size === 'lg' ? 'size-14 text-lg' : 'size-8 text-xs'
      }`}
      aria-hidden
    >
      {initials(user)}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}…
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 font-mono text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
      {children}
    </kbd>
  );
}
