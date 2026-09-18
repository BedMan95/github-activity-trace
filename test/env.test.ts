import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateEnvironment, getGitHubToken, validateGitHubToken, checkEnvironmentAndLog } from '../lib/env';

describe('Environment Validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Restore original environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment after each test
    process.env = { ...originalEnv };
  });

  describe('validateEnvironment', () => {
    it('should throw error when GITHUB_TOKEN is missing', () => {
      // Arrange
      delete process.env.GITHUB_TOKEN;

      // Act & Assert
      expect(() => {
        validateEnvironment();
      }).toThrow(/cannot start because the following environment variables are not configured/);
    });

    it('should throw error when GITHUB_TOKEN is empty string', () => {
      // Arrange
      process.env.GITHUB_TOKEN = '';

      // Act & Assert
      expect(() => {
        validateEnvironment();
      }).toThrow(/cannot start because the following environment variables are not configured/);
    });

    it('should not throw when GITHUB_TOKEN has valid value', () => {
      // Arrange
      process.env.GITHUB_TOKEN = 'test-token';

      // Act & Assert
      expect(() => {
        validateEnvironment();
      }).not.toThrow();
    });
  });

  describe('getGitHubToken', () => {
    it('should return GITHUB_TOKEN if set', () => {
      // Arrange
      process.env.GITHUB_TOKEN = 'my-test-token';

      // Act
      const token = getGitHubToken();

      // Assert
      expect(token).toBe('my-test-token');
    });

    it('should return undefined if GITHUB_TOKEN is not set', () => {
      // Arrange
      delete process.env.GITHUB_TOKEN;

      // Act
      const token = getGitHubToken();

      // Assert
      expect(token).toBeUndefined();
    });
  });

  describe('validateGitHubToken', () => {
    it('should throw error when GITHUB_TOKEN is missing', () => {
      // Arrange
      delete process.env.GITHUB_TOKEN;

      // Act & Assert
      expect(() => {
        validateGitHubToken();
      }).toThrow(/GitHub token is not configured/);
    });

    it('should throw error when GITHUB_TOKEN is empty string', () => {
      // Arrange
      process.env.GITHUB_TOKEN = '';

      // Act & Assert
      expect(() => {
        validateGitHubToken();
      }).toThrow(/GitHub token is configured but empty/);
    });

    it('should not throw when GITHUB_TOKEN has valid value', () => {
      // Arrange
      process.env.GITHUB_TOKEN = 'ghp_test_token_123';

      // Act & Assert
      expect(() => {
        validateGitHubToken();
      }).not.toThrow();
    });

    it('should not throw when GITHUB_TOKEN has whitespace', () => {
      // Arrange
      process.env.GITHUB_TOKEN = '   ghp_test_token_123   ';

      // Act & Assert
      expect(() => {
        validateGitHubToken();
      }).not.toThrow();
    });
  });

  describe('checkEnvironmentAndLog', () => {
    it('should return true and log success when env is valid', () => {
      // Arrange
      process.env.GITHUB_TOKEN = 'test-token';
      const logSpy = vi.spyOn(console, 'log');

      // Act
      const result = checkEnvironmentAndLog();

      // Assert
      expect(result).toBe(true);
      expect(logSpy).toHaveBeenCalledWith('GitHub Commit Activity Tracker: Environment validation passed');
    });

    it('should return false and log error when env is invalid', () => {
      // Arrange
      delete process.env.GITHUB_TOKEN;
      const errorSpy = vi.spyOn(console, 'error');

      // Act
      const result = checkEnvironmentAndLog();

      // Assert
      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
