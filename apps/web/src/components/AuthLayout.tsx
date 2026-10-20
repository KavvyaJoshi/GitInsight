import type { ReactNode } from 'react';
import { LogoMark } from './Logo';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-start justify-center px-4 pt-12 pb-16 sm:pt-20">
      <div className="w-full max-w-sm">
        <LogoMark className="size-9" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-zinc-500">{subtitle}</p>
        <div className="mt-8">{children}</div>
        <div className="mt-8 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">{footer}</div>
      </div>
    </div>
  );
}
