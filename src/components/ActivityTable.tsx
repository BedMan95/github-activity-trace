'use client';

import React, { useMemo, useState, useEffect } from 'react';
import type { Commit } from '@/types/github';
import { formatDateDDMMYYYY, truncateMessage } from '@/types/formatting';

interface ActivityTableProps {
  commits: Commit[];
  isLoading?: boolean;
  pageSize?: number;
}

export const ActivityTable: React.FC<ActivityTableProps> = ({
  commits,
  isLoading = false,
  pageSize = 10,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [translateId, setTranslateId] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  };

  const sortedCommits = useMemo(() => {
    return [...commits].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [commits]);

  // Reset to page 1 when dataset changes
  useEffect(() => {
    setCurrentPage(1);
  }, [commits]);

  const totalPages = Math.ceil(sortedCommits.length / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const currentCommits = sortedCommits.slice(startIndex, startIndex + pageSize);

  // Auto-translate current page commits if translate toggle is ON
  useEffect(() => {
    if (!translateId || currentCommits.length === 0) return;

    const untranslated = currentCommits.filter((c) => !translations[c.sha || c.id]);
    if (untranslated.length === 0) return;

    let isCancelled = false;
    setIsTranslating(true);

    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts: untranslated.map((c) => c.message),
        target: 'id',
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!isCancelled && data.translations) {
          setTranslations((prev) => {
            const next = { ...prev };
            untranslated.forEach((c, idx) => {
              if (data.translations[idx]) {
                next[c.sha || c.id] = data.translations[idx];
              }
            });
            return next;
          });
        }
      })
      .catch((err) => console.error('Auto-translation failed:', err))
      .finally(() => {
        if (!isCancelled) setIsTranslating(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [translateId, currentPage, currentCommits, translations]);

  if (!isLoading && sortedCommits.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800/80 bg-white/50 dark:bg-neutral-900/20 py-20 px-6 text-center">
        <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">No commits found</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 max-w-sm mx-auto">
          No records match the current filter criteria. Try expanding your date range or selecting another repository.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col justify-between gap-2.5 min-h-0">
      <div className="w-full flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900/60 shadow-[0_1px_3px_rgba(0,0,0,0.03)] backdrop-blur-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-white dark:bg-neutral-900 shadow-[0_1px_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr className="border-b border-neutral-100 dark:border-neutral-800/80 text-[11px] font-medium text-neutral-400 dark:text-neutral-500 tracking-normal">
              <th scope="col" className="px-6 py-3 min-w-[200px]">Repository</th>
              <th scope="col" className="px-6 py-3 min-w-[340px]">
                <div className="flex items-center justify-between gap-2">
                  <span>Activity</span>
                  <div className="flex items-center gap-1.5">
                    {translateId && Object.keys(translations).length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const pageTexts = currentCommits
                            .map((c) => translations[c.sha || c.id] || c.message)
                            .join('\n');
                          copyToClipboard(pageTexts, 'all-page');
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white cursor-pointer transition"
                      >
                        {copiedKey === 'all-page' ? 'Tersalin!' : 'Salin Semua'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTranslateId((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium cursor-pointer transition ${
                        translateId
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white border border-transparent'
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                      </svg>
                      <span>{translateId ? (isTranslating ? 'Menerjemahkan...' : 'Terjemahan ID (Aktif)') : 'Terjemahkan ke ID'}</span>
                    </button>
                  </div>
                </div>
              </th>
              <th scope="col" className="px-6 py-3 min-w-[120px] text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/50">
            {currentCommits.map((commit) => {
              const commitKey = commit.sha || commit.id;
              const originalMessage = commit.message;
              const displayMessage = translateId && translations[commitKey]
                ? translations[commitKey]
                : originalMessage;

              const truncated = truncateMessage(displayMessage, 100);
              const formatted = formatDateDDMMYYYY(commit.date);
              const isTruncated = displayMessage.length > 100;
              const shortSha = commit.sha ? commit.sha.substring(0, 7) : '';

              return (
                <tr
                  key={commitKey}
                  className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/30 transition-colors"
                >
                  <td className="px-6 py-3 align-top">
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {commit.repository}
                    </span>
                  </td>
                  <td className="px-6 py-3 align-top leading-relaxed text-neutral-600 dark:text-neutral-300">
                    <div className="group/row flex flex-wrap items-baseline gap-2">
                      <span
                        title={isTruncated || (translateId && translations[commitKey]) ? `Asli: ${originalMessage}` : undefined}
                        className={isTruncated ? 'cursor-help hover:text-neutral-900 dark:hover:text-white transition-colors' : ''}
                      >
                        {truncated}
                      </span>
                      {translateId && translations[commitKey] && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium">
                          ID
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => copyToClipboard(displayMessage, commitKey)}
                        title="Salin teks"
                        className="opacity-0 group-hover/row:opacity-100 p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition cursor-pointer"
                      >
                        {copiedKey === commitKey ? (
                          <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">Tersalin!</span>
                        ) : (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                      {shortSha && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                          {shortSha}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 align-top text-right text-neutral-400 dark:text-neutral-500 whitespace-nowrap font-mono text-[11px]">
                    {formatted}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {sortedCommits.length > pageSize && (
        <div className="shrink-0 flex items-center justify-between px-2 py-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          <div>
            Showing <span className="font-medium text-neutral-800 dark:text-neutral-200">{startIndex + 1}</span> to{' '}
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {Math.min(startIndex + pageSize, sortedCommits.length)}
            </span>{' '}
            of <span className="font-medium text-neutral-800 dark:text-neutral-200">{sortedCommits.length}</span> commits
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition cursor-pointer text-xs"
            >
              Prev
            </button>

            <span className="px-2 py-0.5 text-xs font-mono">
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition cursor-pointer text-xs"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
