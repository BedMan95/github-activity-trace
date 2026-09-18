import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportCommitsToCSV } from '../lib/csv';
import type { Commit } from '../types/github';

describe('exportCommitsToCSV', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when commits list is empty', () => {
    expect(exportCommitsToCSV([])).toBe(false);
  });

  it('generates CSV and triggers download when commits exist', () => {
    const mockCommits: Commit[] = [
      {
        id: '1',
        repository: 'user/repo-a',
        message: 'fix: resolve issue, with comma',
        date: '2026-01-01T10:00:00Z',
        author: 'user',
        sha: 'abc1234',
        url: 'https://github.com/user/repo-a/commit/abc1234',
      },
    ];

    const clickSpy = vi.fn();
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.createElement('div'));
    const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.createElement('div'));

    vi.spyOn(document, 'createElement').mockReturnValue({
      setAttribute: vi.fn(),
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    const result = exportCommitsToCSV(mockCommits);
    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalled();

    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
