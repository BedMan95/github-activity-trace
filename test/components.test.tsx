import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityTable } from '../src/components/ActivityTable';
import { FilterBar } from '../src/components/FilterBar';
import { ErrorDisplay } from '../src/components/ErrorDisplay';
import type { Commit, Repository } from '../types/github';

describe('UI Components', () => {
  const mockCommits: Commit[] = [
    {
      id: '1',
      repository: 'test/repo',
      message: 'Initial commit',
      date: '2026-03-01T12:00:00Z',
      author: 'dev',
      sha: '123456',
      url: 'https://github.com/test/repo/commit/123456',
    },
  ];

  const mockRepos: Repository[] = [
    {
      id: 101,
      name: 'repo',
      full_name: 'test/repo',
      private: false,
      updated_at: '2026-03-01T12:00:00Z',
    },
  ];

  it('renders ActivityTable with commit rows', () => {
    render(<ActivityTable commits={mockCommits} />);
    expect(screen.getByText('test/repo')).toBeInTheDocument();
    expect(screen.getByText('Initial commit')).toBeInTheDocument();
    expect(screen.getByText('01-03-2026')).toBeInTheDocument();
  });

  it('handles pagination at 10 items per page by default', () => {
    const manyCommits: Commit[] = Array.from({ length: 25 }, (_, i) => ({
      id: `id-${i}`,
      repository: 'test/repo',
      message: `Commit message ${i + 1}`,
      date: '2026-03-01T12:00:00Z',
      author: 'dev',
      sha: `sha-${i}`,
      url: `https://github.com/test/repo/commit/${i}`,
    }));

    render(<ActivityTable commits={manyCommits} />);
    expect(screen.getByText('Commit message 1')).toBeInTheDocument();
    expect(screen.getByText('Commit message 10')).toBeInTheDocument();
    expect(screen.queryByText('Commit message 11')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 to 10 of 25 commits');

    // Click Next
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Commit message 11')).toBeInTheDocument();
    expect(screen.getByText('Commit message 20')).toBeInTheDocument();
    expect(screen.queryByText('Commit message 1')).not.toBeInTheDocument();
  });

  it('renders empty state when no commits', () => {
    render(<ActivityTable commits={[]} />);
    expect(screen.getByText('No commits found')).toBeInTheDocument();
  });

  it('renders FilterBar and triggers changes', () => {
    const onReposChange = vi.fn();
    const onExportExcel = vi.fn();

    render(
      <FilterBar
        repositories={mockRepos}
        selectedRepos={[]}
        startDate={null}
        endDate={null}
        onReposChange={onReposChange}
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        isLoading={false}
        onExportExcel={onExportExcel}
        canExport={true}
      />
    );

    // Click dropdown button to open
    const dropdownBtn = screen.getByText('All repositories');
    fireEvent.click(dropdownBtn);

    // Find and toggle checkbox for test/repo
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onReposChange).toHaveBeenCalledWith(['test/repo']);

    const exportBtn = screen.getByText('Export Excel');
    fireEvent.click(exportBtn);
    expect(onExportExcel).toHaveBeenCalled();
  });

  it('renders FilterBar and filters by repo owner', () => {
    const multiOwnerRepos: Repository[] = [
      { id: 1, name: 'personal-repo', full_name: 'BedMan95/personal-repo', private: false, updated_at: '2026-03-01' },
      { id: 2, name: 'org-repo', full_name: 'itcenternusantara/org-repo', private: true, updated_at: '2026-03-01' },
    ];

    render(
      <FilterBar
        repositories={multiOwnerRepos}
        selectedRepos={[]}
        startDate={null}
        endDate={null}
        onReposChange={vi.fn()}
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        isLoading={false}
        onExportExcel={vi.fn()}
        canExport={true}
      />
    );

    // Open dropdown
    fireEvent.click(screen.getByText('All repositories'));

    // Verify owner pills exist
    expect(screen.getByText('Semua Owner')).toBeInTheDocument();
    expect(screen.getByText('BedMan95')).toBeInTheDocument();
    expect(screen.getByText('itcenternusantara')).toBeInTheDocument();

    // Filter by BedMan95 owner
    fireEvent.click(screen.getByText('BedMan95'));
    expect(screen.getByText('BedMan95/personal-repo')).toBeInTheDocument();
    expect(screen.queryByText('itcenternusantara/org-repo')).not.toBeInTheDocument();
  });

  it('renders ErrorDisplay with retry and dismiss', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ErrorDisplay
        error="Invalid token"
        type="auth"
        onRetry={onRetry}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText('Invalid token')).toBeInTheDocument();
    expect(screen.getByText('Authentication Error')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Dismiss error'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
