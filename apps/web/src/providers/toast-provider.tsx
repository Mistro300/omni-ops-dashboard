'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 end-4 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((item) => {
          const Icon =
            item.variant === 'success'
              ? CheckCircle2
              : item.variant === 'error'
                ? AlertCircle
                : Info;
          const accentColor =
            item.variant === 'success'
              ? 'var(--status-emerald-dot)'
              : item.variant === 'error'
                ? 'var(--status-rose-dot)'
                : 'var(--status-indigo-dot)';

          return (
            <div
              key={item.id}
              className="pointer-events-auto flex items-start gap-3 rounded-card border border-border bg-surface p-3.5 text-start"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink-primary">{item.title}</div>
                {item.description && (
                  <p className="mt-0.5 text-xs text-ink-secondary">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-control p-1 text-ink-secondary hover:bg-subtle hover:text-ink-primary"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
