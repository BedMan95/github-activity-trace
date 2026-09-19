'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { Repository, Commit } from '@/types/github';
import { FilterBar } from '@/components/FilterBar';
import { ActivityTable } from '@/components/ActivityTable';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { exportDailySummariesToExcel } from '@/lib/excel';
import { formatDateDDMMYYYY } from '@/types/formatting';
import { SettingsModal } from '@/components/SettingsModal';

export default function Home() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'auth' | 'rate_limit' | 'service' | 'general'>('general');
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState<boolean>(false);
  const [rateLimitResetTime, setRateLimitResetTime] = useState<string | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasNoToken, setHasNoToken] = useState(false);

  // Stats calculation
  const stats = useMemo(() => {
    const uniqueRepos = new Set(commits.map(c => c.repository)).size;
    return {
      commitsCount: commits.length,
      reposActive: uniqueRepos,
    };
  }, [commits]);

  const fetchRepositories = useCallback(async () => {
    try {
      const res = await fetch('/api/github/repositories');
      const data = await res.json();

      if (!res.ok) {
        handleApiError(res.status, data);
        return;
      }

      setRepositories(data.repositories || []);
      updateRateLimit(data.rateLimitInfo);
    } catch {
      setError('Could not connect to GitHub repository service.');
      setErrorType('service');
    }
  }, []);

  const fetchCommits = useCallback(async (repos: string[] = selectedRepos, start: string | null = startDate, end: string | null = endDate) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (repos && repos.length > 0) params.set('repository', repos.join(','));
      if (start) params.set('startDate', start);
      if (end) params.set('endDate', end);

      const res = await fetch(`/api/github/commits?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        handleApiError(res.status, data);
        setCommits([]);
        return;
      }

      setCommits(data.commits || []);
      updateRateLimit(data.rateLimitInfo);
    } catch {
      setError('Failed to fetch commit activity.');
      setErrorType('service');
      setCommits([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedRepos, startDate, endDate]);

  const handleApiError = (status: number, data: { error?: string; message?: string; retryAfter?: number }) => {
    const msg = data.message || 'An unexpected error occurred';
    setError(msg);
    setRetryAfter(data.retryAfter || null);

    if (status === 401 || status === 403) {
      if (data.error === 'RATE_LIMIT_EXCEEDED') {
        setErrorType('rate_limit');
      } else {
        setErrorType('auth');
        if (data.error === 'TOKEN_NOT_CONFIGURED' || data.error === 'INVALID_TOKEN') {
          setHasNoToken(true);
        }
      }
    } else if (status === 429) {
      setErrorType('rate_limit');
    } else if (status >= 500) {
      setErrorType('service');
    } else {
      setErrorType('general');
    }
  };

  const updateRateLimit = (rateLimitInfo?: { remaining: number; resetTime: number; limit: number }) => {
    if (!rateLimitInfo) return;
    setRemainingQuota(rateLimitInfo.remaining);
    if (rateLimitInfo.remaining < 10) {
      setRateLimitWarning(true);
      const reset = new Date(rateLimitInfo.resetTime * 1000).toLocaleTimeString();
      setRateLimitResetTime(reset);
    } else {
      setRateLimitWarning(false);
      setRateLimitResetTime(null);
    }
  };

  const handleSettingsSaved = async () => {
    setHasNoToken(false);
    setError(null);
    setIsLoading(true);
    await fetchRepositories();
    await fetchCommits(selectedRepos, startDate, endDate);
    setIsLoading(false);
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const settingsRes = await fetch('/api/settings');
        const settingsData = await settingsRes.json();
        if (!settingsData.settings?.githubToken) {
          setHasNoToken(true);
        }
      } catch {
        // ignore
      }
      await fetchRepositories();
      await fetchCommits();
      setIsLoading(false);
    };
    init();
  }, []);

  // Filter change handlers
  const handleReposChange = (repos: string[]) => {
    setSelectedRepos(repos);
    fetchCommits(repos, startDate, endDate);
  };

  const handleStartDateChange = (date: string | null) => {
    setStartDate(date);
    fetchCommits(selectedRepos, date, endDate);
  };

  const handleEndDateChange = (date: string | null) => {
    setEndDate(date);
    fetchCommits(selectedRepos, startDate, date);
  };

  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const handleExportExcel = async () => {
    if (commits.length === 0) {
      alert('No data to export');
      return;
    }

    setIsExportingExcel(true);
    try {
      // 1. Group commits by date (DD-MM-YYYY) and repository
      const groupMap = new Map<string, { date: string; repo: string; messages: string[] }>();

      for (const c of commits) {
        const dateStr = formatDateDDMMYYYY(c.date);
        const key = `${dateStr}__${c.repository}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, { date: dateStr, repo: c.repository, messages: [] });
        }
        groupMap.get(key)!.messages.push(c.message.replace(/\r?\n|\r/g, ' '));
      }

      const groups = Array.from(groupMap.values());

      // 2. Call OpenAI-compatible summarize endpoint
      let summaries: Record<string, string> = {};
      try {
        const res = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groups }),
        });
        const data = await res.json();
        if (data.summaries) {
          summaries = data.summaries;
        }
      } catch (err) {
        console.error('Summarize error:', err);
      }

      // 3. Prepare rows: Tanggal, Repo, Task (Bahasa Indonesia)
      const rows = groups.map((g) => {
        const key = `${g.date}__${g.repo}`;
        const summarizedTask = summaries[key] || g.messages.map((m) => `• ${m}`).join('\n');
        return {
          date: g.date,
          repo: g.repo,
          task: summarizedTask,
        };
      });

      exportDailySummariesToExcel(rows);
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <main className="h-screen max-h-screen py-6 px-4 sm:px-8 lg:px-12 mx-auto flex flex-col gap-4 overflow-hidden">
      {/* Studio Header */}
      <header className="shrink-0 flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-neutral-200/80 dark:border-neutral-800/80">
        <div>
          <span className="text-[11px] font-medium tracking-wider text-neutral-400 dark:text-neutral-500 uppercase">
            Activity Trace
          </span>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 mt-0.5">
            GitHub Commits
          </h1>
        </div>

        {/* Minimal metrics & Settings */}
        <div className="flex items-center gap-6 text-xs text-neutral-500 dark:text-neutral-400">
          <div className="flex flex-col sm:items-end">
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 uppercase">Commits</span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{stats.commitsCount}</span>
          </div>
          <div className="flex flex-col sm:items-end">
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 uppercase">Repos</span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{stats.reposActive}</span>
          </div>
          {remainingQuota !== null && (
            <div className="flex flex-col sm:items-end">
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 uppercase">API Quota</span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{remainingQuota}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Pengaturan"
            title="Pengaturan"
            className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {hasNoToken && (
        <div className="shrink-0 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-blue-600 dark:text-blue-400">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>GitHub Personal Access Token belum dikonfigurasi. Silakan atur token Anda untuk memuat commit.</span>
          </div>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="shrink-0 font-medium px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition cursor-pointer"
          >
            Buka Pengaturan
          </button>
        </div>
      )}

      {error && (
        <div className="shrink-0">
          <ErrorDisplay
            error={error}
            type={errorType}
            retryAfter={retryAfter}
            onRetry={() => fetchCommits(selectedRepos, startDate, endDate)}
            onDismiss={() => setError(null)}
          />
        </div>
      )}

      <div className="shrink-0 relative z-30">
        <FilterBar
          repositories={repositories}
          selectedRepos={selectedRepos}
          startDate={startDate}
          endDate={endDate}
          onReposChange={handleReposChange}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
          isLoading={false}
          rateLimitWarning={rateLimitWarning}
          rateLimitResetTime={rateLimitResetTime}
          onExportExcel={handleExportExcel}
          isExportingExcel={isExportingExcel}
          canExport={commits.length > 0}
        />
      </div>

      <section className="relative z-0 flex-1 min-h-0 flex flex-col">
        {isLoading && <LoadingSpinner overlay label="Loading commits..." />}
        <ActivityTable commits={commits} isLoading={isLoading} />
      </section>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={handleSettingsSaved}
      />
    </main>
  );
}
