import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportCommitsToExcel, exportDailySummariesToExcel } from '../lib/excel';
import type { Commit } from '../types/github';

describe('exportCommitsToExcel', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-excel-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when commits list is empty', () => {
    expect(exportCommitsToExcel([])).toBe(false);
  });

  it('generates Excel XML and triggers download with Tanggal, Repo, Task (ID)', () => {
    const mockCommits: Commit[] = [
      {
        id: '1',
        repository: 'itcenter/web.erpro',
        message: 'fix: handle token expiry & format',
        date: '2026-03-01T12:00:00Z',
        author: 'Andika',
        sha: 'abc1234',
        url: 'https://github.com/itcenter/web.erpro/commit/abc1234',
      },
    ];

    const translations = {
      abc1234: 'Perbaiki penanganan kadaluwarsa token & format',
    };

    const clickSpy = vi.fn();
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.createElement('div'));
    const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.createElement('div'));

    vi.spyOn(document, 'createElement').mockReturnValue({
      setAttribute: vi.fn(),
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    const result = exportCommitsToExcel(mockCommits, translations);
    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalled();

    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe('exportDailySummariesToExcel', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-excel-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when summaries list is empty', () => {
    expect(exportDailySummariesToExcel([])).toBe(false);
  });

  it('generates Excel XML with grouped daily summaries and triggers download', () => {
    const summaries = [
      {
        date: '01-03-2026',
        repo: 'itcenter/web.erpro',
        task: 'Memperbaiki penanganan kadaluwarsa token dan validasi formulir.',
      },
    ];

    const clickSpy = vi.fn();
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.createElement('div'));
    const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.createElement('div'));

    vi.spyOn(document, 'createElement').mockReturnValue({
      setAttribute: vi.fn(),
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    const result = exportDailySummariesToExcel(summaries);
    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalled();

    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
