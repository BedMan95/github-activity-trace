/**
 * Cache Service for GitHub Commit Activity Tracker
 * 
 * Provides in-memory caching with configurable TTL for:
 * - Repositories and commits: 1-hour TTL
 * - Rate limit errors: 5-minute TTL
 * 
 * Supports cache invalidation and status checking.
 */

// TTL constants in milliseconds
const TTL_REPOSITORIES = 60 * 60 * 1000; // 1 hour = 3600000ms
const TTL_COMMITS = 60 * 60 * 1000; // 1 hour = 3600000ms
const TTL_RATE_LIMIT_ERROR = 5 * 60 * 1000; // 5 minutes = 300000ms

// Cache key prefixes for organizing cache entries
const CACHE_KEYS = {
  REPOSITORIES: 'repositories',
  COMMITS: 'commits:',
  RATE_LIMIT_ERROR: 'rate_limit_error',
} as const;

// Type definitions for cache entries
type CacheKeyPrefix = typeof CACHE_KEYS[keyof typeof CACHE_KEYS];

/**
 * Get TTL in milliseconds for a given cache type
 */
function getTTL(type: 'repositories' | 'commits' | 'rate_limit_error'): number {
  switch (type) {
    case 'repositories':
      return TTL_REPOSITORIES;
    case 'commits':
      return TTL_COMMITS;
    case 'rate_limit_error':
      return TTL_RATE_LIMIT_ERROR;
    default:
      return TTL_REPOSITORIES;
  }
}

/**
 * Build a cache key from a prefix and optional identifier
 */
function buildCacheKey(prefix: CacheKeyPrefix, identifier?: string): string {
  return identifier ? `${prefix}:${identifier}` : prefix;
}

/**
 * Check if a cache entry is expired
 */
function isExpired(timestamp: number, ttl: number): boolean {
  return Date.now() - timestamp > ttl;
}

/**
 * CacheEntry represents a stored value with metadata
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Internal storage type for the cache
 */
interface CacheStorage {
  [key: string]: CacheEntry<unknown>;
}

/**
 * CacheService provides in-memory caching with TTL and invalidation support
 */
export class CacheService {
  private storage: CacheStorage;
  private maxEntries: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null;

  constructor(maxEntries: number = 100) {
    this.storage = {};
    this.maxEntries = maxEntries;
    this.cleanupTimer = null;
    this.startCleanupTimer();
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanupTimer(): void {
    // Clean up expired entries every 5 minutes
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 5 * 60 * 1000);
  }

  /**
   * Stop the cleanup timer (cleanup on destroy)
   */
  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up expired entries from the cache
   * Also enforces max entries limit by removing oldest entries
   */
  private cleanupExpiredEntries(): void {
    const entries = Object.entries(this.storage);
    
    // Remove expired entries
    for (const [key, entry] of entries) {
      if (isExpired(entry.timestamp, entry.ttl)) {
        delete this.storage[key];
      }
    }

    // If still over max entries, remove oldest entries
    const remainingKeys = Object.keys(this.storage);
    if (remainingKeys.length > this.maxEntries) {
      const sortedByTimestamp = remainingKeys.sort(
        (a, b) => this.storage[a].timestamp - this.storage[b].timestamp
      );
      const toRemove = sortedByTimestamp.slice(0, remainingKeys.length - this.maxEntries);
      for (const key of toRemove) {
        delete this.storage[key];
      }
    }
  }

  /**
   * Get a cached value if it exists and is not expired
   * @param prefix - Cache key prefix (repositories, commits, rate_limit_error)
   * @param identifier - Optional identifier to make the key unique
   * @returns The cached data or null if not found or expired
   */
  public get<T>(prefix: CacheKeyPrefix, identifier?: string): T | null {
    const key = buildCacheKey(prefix, identifier);
    const entry = this.storage[key] as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    if (isExpired(entry.timestamp, entry.ttl)) {
      delete this.storage[key];
      return null;
    }

    return entry.data;
  }

  /**
   * Set a value in the cache with the appropriate TTL
   * @param prefix - Cache key prefix
   * @param identifier - Optional identifier to make the key unique
   * @param data - The data to cache
   * @param type - The type of data (determines TTL)
   */
  public set<T>(
    prefix: CacheKeyPrefix,
    identifier: string | undefined,
    data: T,
    type: 'repositories' | 'commits' | 'rate_limit_error'
  ): void {
    const key = buildCacheKey(prefix, identifier);
    const ttl = getTTL(type);

    this.storage[key] = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    // Cleanup if we're approaching max entries
    if (Object.keys(this.storage).length > this.maxEntries) {
      this.cleanupExpiredEntries();
    }
  }

  /**
   * Invalidate a specific cache entry
   * @param prefix - Cache key prefix
   * @param identifier - Optional identifier
   */
  public invalidate(prefix: CacheKeyPrefix, identifier?: string): void {
    const key = buildCacheKey(prefix, identifier);
    delete this.storage[key];
  }

  /**
   * Invalidate all entries matching a prefix
   * @param prefix - Cache key prefix to invalidate
   */
  public invalidateByPrefix(prefix: CacheKeyPrefix): void {
    const keys = Object.keys(this.storage);
    for (const key of keys) {
      if (key.startsWith(prefix)) {
        delete this.storage[key];
      }
    }
  }

  /**
   * Invalidate all repository cache entries
   */
  public invalidateRepositories(): void {
    this.invalidateByPrefix(CACHE_KEYS.REPOSITORIES);
  }

  /**
   * Invalidate all commit cache entries
   */
  public invalidateCommits(): void {
    this.invalidateByPrefix(CACHE_KEYS.COMMITS);
  }

  /**
   * Invalidate all rate limit error cache entries
   */
  public invalidateRateLimitErrors(): void {
    this.invalidateByPrefix(CACHE_KEYS.RATE_LIMIT_ERROR);
  }

  /**
   * Invalidate all cache entries
   */
  public invalidateAll(): void {
    this.storage = {};
  }

  /**
   * Check if a cache entry exists and is valid (not expired)
   * @param prefix - Cache key prefix
   * @param identifier - Optional identifier
   * @returns true if valid cached entry exists
   */
  public has(prefix: CacheKeyPrefix, identifier?: string): boolean {
    const key = buildCacheKey(prefix, identifier);
    const entry = this.storage[key];

    if (!entry) {
      return false;
    }

    if (isExpired(entry.timestamp, entry.ttl)) {
      delete this.storage[key];
      return false;
    }

    return true;
  }

  /**
   * Get cache status for a specific entry
   * @param prefix - Cache key prefix
   * @param identifier - Optional identifier
   * @returns Cache status or null if not found
   */
  public getStatus(
    prefix: CacheKeyPrefix,
    identifier?: string
  ): { exists: boolean; isExpired: boolean; remainingTTL: number } | null {
    const key = buildCacheKey(prefix, identifier);
    const entry = this.storage[key] as CacheEntry<unknown> | undefined;

    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    const remainingTTL = Math.max(0, entry.ttl - age);

    return {
      exists: true,
      isExpired: remainingTTL === 0,
      remainingTTL,
    };
  }

  /**
   * Get the number of entries in the cache
   */
  public size(): number {
    return Object.keys(this.storage).length;
  }

  /**
   * Get cache statistics for monitoring
   */
  public getStats(): {
    totalEntries: number;
    expiredEntries: number;
    entriesByPrefix: Record<string, number>;
  } {
    const entries = Object.entries(this.storage);
    const entriesByPrefix: Record<string, number> = {};
    let expiredEntries = 0;

    for (const [key, entry] of entries) {
      // Count by prefix
      for (const prefix of Object.values(CACHE_KEYS)) {
        if (key.startsWith(prefix)) {
          entriesByPrefix[prefix] = (entriesByPrefix[prefix] || 0) + 1;
          break;
        }
      }

      // Check expiration
      if (isExpired(entry.timestamp, entry.ttl)) {
        expiredEntries++;
      }
    }

    return {
      totalEntries: entries.length,
      expiredEntries,
      entriesByPrefix,
    };
  }
}

// Singleton instance for application-wide use
let cacheInstance: CacheService | null = null;

/**
 * Get or create the singleton cache instance
 */
export function getCacheService(): CacheService {
  if (!cacheInstance) {
    cacheInstance = new CacheService();
  }
  return cacheInstance;
}

/**
 * Reset the cache singleton (primarily for testing)
 */
export function resetCacheService(): void {
  if (cacheInstance) {
    cacheInstance.destroy();
  }
  cacheInstance = null;
}

// Export TTL constants for external use
export {
  TTL_REPOSITORIES,
  TTL_COMMITS,
  TTL_RATE_LIMIT_ERROR,
  CACHE_KEYS,
};