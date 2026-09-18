'use client';

import React from 'react';

interface ErrorDisplayProps {
  error: string | null;
  type?: 'auth' | 'rate_limit' | 'service' | 'general';
  retryAfter?: number | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  type = 'general',
  retryAfter,
  onRetry,
  onDismiss,
}) => {
  if (!error) return null;

  const typeConfig = {
    auth: {
      border: 'border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300',
      badge: 'Authentication Error',
    },
    rate_limit: {
      border: 'border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200',
      badge: 'Rate Limit',
    },
    service: {
      border: 'border-orange-500/40 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200',
      badge: 'Service Unavailable',
    },
    general: {
      border: 'border-red-500/40 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300',
      badge: 'Error',
    },
  }[type];

  return (
    <div
      role="alert"
      className={`rounded-lg border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${typeConfig.border}`}
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase font-bold tracking-wide opacity-80">
          {typeConfig.badge}
        </span>
        <p className="text-sm font-medium">{error}</p>
        {retryAfter && retryAfter > 0 && (
          <p className="text-xs opacity-80">Retry in {retryAfter} seconds</p>
        )}
      </div>
      <div className="flex items-center gap-2 self-end md:self-center">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[44px] px-3.5 py-1.5 text-xs font-semibold rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition cursor-pointer"
          >
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error"
            className="min-h-[44px] min-w-[44px] p-2 text-xs font-semibold rounded-md border border-current opacity-75 hover:opacity-100 transition cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
