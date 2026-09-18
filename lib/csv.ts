import type { Commit } from '@/types/github';
import { formatDateDDMMYYYY } from '@/types/formatting';

export function exportCommitsToCSV(commits: Commit[], filename = 'github-commits.csv'): boolean {
  if (!commits || commits.length === 0) {
    return false;
  }

  const headers = ['Repository', 'Activity', 'Date'];
  const rows = commits.map((commit) => [
    commit.repository,
    commit.message.replace(/\r?\n|\r/g, ' '),
    formatDateDDMMYYYY(commit.date),
  ]);

  const escapeCSV = (field: string): string => {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return true;
}
