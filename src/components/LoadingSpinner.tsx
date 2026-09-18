'use client';

import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  overlay?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  label = 'Loading...',
  overlay = false,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  }[size];

  const spinner = (
    <div
      role="status"
      aria-label={label}
      className="flex flex-col items-center justify-center gap-2"
    >
      <div
        className={`${sizeClasses} rounded-full border-blue-500 border-t-transparent animate-spin`}
      />
      {label && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
          {label}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );

  if (overlay) {
    return (
      <div className="absolute inset-0 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xs flex items-center justify-center z-20">
        {spinner}
      </div>
    );
  }

  return spinner;
};
