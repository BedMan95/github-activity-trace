'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Repository } from '@/types/github';
import { parseDDMMYYYYToISO, parseISOToDDMMYYYY } from '@/types/formatting';

interface FilterBarProps {
  repositories: Repository[];
  selectedRepos: string[];
  startDate: string | null; // ISO YYYY-MM-DD
  endDate: string | null;   // ISO YYYY-MM-DD
  onReposChange: (repos: string[]) => void;
  onStartDateChange: (isoDate: string | null) => void;
  onEndDateChange: (isoDate: string | null) => void;
  isLoading: boolean;
  rateLimitWarning?: boolean;
  rateLimitResetTime?: string | null;
  onExportExcel: () => void;
  isExportingExcel?: boolean;
  canExport: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  repositories,
  selectedRepos = [],
  startDate,
  endDate,
  onReposChange,
  onStartDateChange,
  onEndDateChange,
  isLoading,
  rateLimitWarning = false,
  rateLimitResetTime = null,
  onExportExcel,
  isExportingExcel = false,
  canExport,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<'all' | string>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Available repo owners (e.g. personal username, organization names)
  const availableOwners = useMemo(() => {
    const owners = new Set<string>();
    for (const r of repositories) {
      const owner = r.full_name.split('/')[0];
      if (owner) owners.add(owner);
    }
    return Array.from(owners).sort();
  }, [repositories]);

  const filteredRepos = useMemo(() => {
    let list = repositories;
    if (ownerFilter !== 'all') {
      list = list.filter((r) => r.full_name.startsWith(`${ownerFilter}/`));
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (r) => r.full_name.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [repositories, ownerFilter, searchQuery]);

  const toggleRepo = (fullName: string) => {
    if (selectedRepos.includes(fullName)) {
      onReposChange(selectedRepos.filter((r) => r !== fullName));
    } else {
      onReposChange([...selectedRepos, fullName]);
    }
  };

  const selectAll = () => {
    onReposChange(filteredRepos.map((r) => r.full_name));
  };

  const clearAll = () => {
    onReposChange([]);
  };

  // Date input display formatting (DD-MM-YYYY)
  const displayStartDate = startDate ? parseISOToDDMMYYYY(startDate) : '';
  const displayEndDate = endDate ? parseISOToDDMMYYYY(endDate) : '';

  const handleDateChange = (val: string, onChange: (iso: string | null) => void) => {
    if (!val) {
      onChange(null);
      return;
    }
    // Native <input type="date"> yields YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      onChange(val);
      return;
    }
    // Manual typed DD-MM-YYYY
    const parsed = parseDDMMYYYYToISO(val);
    if (parsed) {
      onChange(parsed);
    }
  };

  return (
    <section
      aria-label="Filter parameters"
      className="relative z-30 rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] backdrop-blur-xs flex flex-col gap-4 overflow-visible"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        {/* Searchable Multi-select Repository Dropdown */}
        <div className="flex flex-col gap-1.5 relative" ref={dropdownRef}>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Repositories {selectedRepos.length > 0 && `(${selectedRepos.length})`}
            </label>
            {selectedRepos.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50 px-3.5 py-2 text-xs text-neutral-800 dark:text-neutral-200 text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition cursor-pointer"
          >
            <span className="truncate pr-2">
              {selectedRepos.length === 0
                ? 'All repositories'
                : selectedRepos.length === 1
                ? selectedRepos[0]
                : `${selectedRepos.length} selected`}
            </span>
            <svg
              className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute top-[105%] left-0 right-0 z-50 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl p-2.5 flex flex-col gap-2 ring-1 ring-black/5 min-w-[280px]">
              {/* Search filter */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari repo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-2.5 text-xs text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                  autoFocus
                />
              </div>

              {/* Owner filter pills */}
              {availableOwners.length > 1 && (
                <div className="flex items-center gap-1 overflow-x-auto py-0.5 pb-1 text-[10px] border-b border-neutral-100 dark:border-neutral-800/80">
                  <button
                    type="button"
                    onClick={() => setOwnerFilter('all')}
                    className={`px-2 py-0.5 rounded-md whitespace-nowrap cursor-pointer transition ${
                      ownerFilter === 'all'
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    Semua Owner
                  </button>
                  {availableOwners.map((owner) => (
                    <button
                      key={owner}
                      type="button"
                      onClick={() => setOwnerFilter(owner)}
                      className={`px-2 py-0.5 rounded-md whitespace-nowrap cursor-pointer transition ${
                        ownerFilter === owner
                          ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      {owner}
                    </button>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-between px-1 py-0.5 text-[11px] text-neutral-500 border-b border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={selectAll}
                  className="hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                >
                  Kosongkan
                </button>
              </div>

              {/* Repo items */}
              <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5">
                {filteredRepos.length === 0 ? (
                  <span className="p-3 text-center text-xs text-neutral-400">Tidak ada repo ditemukan</span>
                ) : (
                  filteredRepos.map((repo) => {
                    const isChecked = selectedRepos.includes(repo.full_name);
                    return (
                      <label
                        key={repo.id}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800/60 cursor-pointer text-xs transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRepo(repo.full_name)}
                          className="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-700 accent-neutral-900 dark:accent-white cursor-pointer"
                        />
                        <span className="truncate text-neutral-800 dark:text-neutral-200">
                          {repo.full_name}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Start Date (DD-MM-YYYY) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="start-date" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Dari (DD-MM-YYYY)
            </label>
            {startDate && (
              <button
                type="button"
                onClick={() => onStartDateChange(null)}
                className="text-[10px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative flex items-center">
            <input
              id="start-date"
              type="date"
              value={startDate || ''}
              onChange={(e) => handleDateChange(e.target.value, onStartDateChange)}
              className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50 px-3.5 py-2 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition cursor-pointer"
            />
            {displayStartDate && (
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-800 dark:text-neutral-200 bg-neutral-50 dark:bg-neutral-950 pr-2">
                {displayStartDate}
              </span>
            )}
          </div>
        </div>

        {/* End Date (DD-MM-YYYY) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="end-date" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Sampai (DD-MM-YYYY)
            </label>
            {endDate && (
              <button
                type="button"
                onClick={() => onEndDateChange(null)}
                className="text-[10px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative flex items-center">
            <input
              id="end-date"
              type="date"
              value={endDate || ''}
              onChange={(e) => handleDateChange(e.target.value, onEndDateChange)}
              className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50 px-3.5 py-2 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition cursor-pointer"
            />
            {displayEndDate && (
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-800 dark:text-neutral-200 bg-neutral-50 dark:bg-neutral-950 pr-2">
                {displayEndDate}
              </span>
            )}
          </div>
        </div>

        {/* Export Excel Action */}
        <div className="flex flex-col justify-end">
          <button
            type="button"
            onClick={onExportExcel}
            disabled={!canExport || isLoading || isExportingExcel}
            className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-30 disabled:hover:bg-emerald-600 text-xs font-medium px-4 py-2 transition cursor-pointer disabled:cursor-not-allowed shadow-xs"
          >
            {isExportingExcel ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Menerjemahkan & Ekspor...</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export Excel</span>
              </>
            )}
          </button>
        </div>
      </div>

      {rateLimitWarning && (
        <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 px-3.5 py-2.5 rounded-xl border border-amber-200/80 dark:border-amber-900/60 flex items-center justify-between">
          <span>GitHub API quota is running low (&lt; 10 remaining).</span>
          {rateLimitResetTime && <span className="font-mono text-[11px]">Resets at {rateLimitResetTime}</span>}
        </div>
      )}
    </section>
  );
};
