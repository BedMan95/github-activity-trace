// Formatting Helpers for GitHub Commit Activity Tracker
// Provides utility types and functions for formatting commit data for display

/**
 * Extended commit interface with formatted display fields
 */
export interface CommitWithFormattedDate {
  /** Original commit ID */
  id: string;
  /** Repository name */
  repository: string;
  /** Original commit message */
  message: string;
  /** Original commit date (ISO 8601 format) */
  date: string;
  /** Commit author username */
  author: string;
  /** Commit SHA hash */
  sha: string;
  /** Commit URL on GitHub */
  url: string;
  /** Formatted date string (YYYY-MM-DD or DD-MM-YYYY) */
  formattedDate: string;
  /** Truncated commit message (max 100 chars with ellipsis) */
  truncatedMessage: string;
}

/**
 * Formatted API response wrapper
 */
export interface FormattedCommitsResponse {
  commits: CommitWithFormattedDate[];
  cached: boolean;
  rateLimitInfo?: RateLimitInfo;
}

/**
 * Formatted repositories response wrapper
 */
export interface FormattedRepositoriesResponse {
  repositories: RepositoryWithFormattedDate[];
  cached: boolean;
  rateLimitInfo?: RateLimitInfo;
}

/**
 * Repository interface with formatted date field
 */
export interface RepositoryWithFormattedDate {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  updated_at: string;
  formattedDate: string;
}

/**
 * Rate limit information
 * Uses Unix timestamp (seconds) for resetTime
 */
export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  limit: number;
}

/**
 * Formats a date string to ISO 8601 date (YYYY-MM-DD)
 * @param date - ISO 8601 date string (e.g., "2024-01-15T10:30:00Z")
 * @returns Formatted date string (e.g., "2024-01-15")
 */
export function formatDate(date: string): string {
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }
    return dateObj.toISOString().split('T')[0];
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Formats a date string to DD-MM-YYYY format
 * @param date - ISO date string or Date object
 * @returns Formatted date string (e.g., "15-01-2024")
 */
export function formatDateDDMMYYYY(date: string | Date): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Converts a DD-MM-YYYY string to YYYY-MM-DD ISO format
 */
export function parseDDMMYYYYToISO(ddmmyyyy: string): string | null {
  const match = ddmmyyyy.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

/**
 * Converts a YYYY-MM-DD ISO string to DD-MM-YYYY format
 */
export function parseISOToDDMMYYYY(iso: string): string {
  const match = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}

/**
 * Truncates a commit message to a maximum length with ellipsis
 * @param message - Original commit message
 * @param maxLength - Maximum message length (default: 100)
 * @returns Truncated message with ellipsis if needed
 */
export function truncateMessage(message: string, maxLength: number = 100): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength) + '...';
}

/**
 * Formats a commit object with formatted date and truncated message
 * @param commit - Original commit object
 * @returns Commit with formatted fields
 */
export function formatCommit(commit: {
  id: string;
  repository: string;
  message: string;
  date: string;
  author: string;
  sha: string;
  url: string;
}): CommitWithFormattedDate {
  return {
    ...commit,
    formattedDate: formatDate(commit.date),
    truncatedMessage: truncateMessage(commit.message),
  };
}

/**
 * Formats an array of commits with formatted date and truncated messages
 * @param commits - Array of commit objects
 * @returns Array of commits with formatted fields
 */
export function formatCommits(commits: Array<{
  id: string;
  repository: string;
  message: string;
  date: string;
  author: string;
  sha: string;
  url: string;
}>): CommitWithFormattedDate[] {
  return commits.map(commit => formatCommit(commit));
}

/**
 * Formats a repository object with formatted date field
 * @param repository - Repository object
 * @returns Repository with formatted date
 */
export function formatRepository(repository: {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  updated_at: string;
}): RepositoryWithFormattedDate {
  return {
    ...repository,
    formattedDate: formatDate(repository.updated_at),
  };
}

/**
 * Formats an array of repositories with formatted dates
 * @param repositories - Array of repository objects
 * @returns Array of repositories with formatted dates
 */
export function formatRepositories(repositories: Array<{
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  updated_at: string;
}>): RepositoryWithFormattedDate[] {
  return repositories.map(repo => formatRepository(repo));
}
