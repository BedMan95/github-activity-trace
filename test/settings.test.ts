import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getSettings,
  saveSettings,
  getEffectiveGitHubToken,
  getEffectiveOpenAIConfig,
} from '../lib/settings';

describe('Settings Management', () => {
  const originalEnv = { ...process.env };
  const tempSettingsPath = path.join(os.tmpdir(), `.test-app-settings-${Date.now()}.json`);

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.APP_SETTINGS_PATH = tempSettingsPath;
    if (fs.existsSync(tempSettingsPath)) {
      fs.unlinkSync(tempSettingsPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempSettingsPath)) {
      try {
        fs.unlinkSync(tempSettingsPath);
      } catch {
        // ignore
      }
    }
    process.env = { ...originalEnv };
  });

  it('should return empty settings when file does not exist', () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;
    const settings = getSettings();
    expect(settings).toBeDefined();
    expect(settings.githubToken).toBe('');
    expect(settings.openaiApiKey).toBe('');
  });

  it('should save and retrieve settings correctly', () => {
    saveSettings({
      githubToken: 'ghp_test12345',
      openaiApiKey: 'sk-test67890',
      openaiBaseUrl: 'https://test.api/v1',
      openaiModel: 'gpt-4o-test',
    });

    const settings = getSettings();
    expect(settings.githubToken).toBe('ghp_test12345');
    expect(settings.openaiApiKey).toBe('sk-test67890');
    expect(settings.openaiBaseUrl).toBe('https://test.api/v1');
    expect(settings.openaiModel).toBe('gpt-4o-test');
  });

  it('should prioritize settings over environment variables', () => {
    process.env.GITHUB_TOKEN = 'env-token';
    expect(getEffectiveGitHubToken()).toBe('env-token');

    saveSettings({ githubToken: 'settings-token' });
    expect(getEffectiveGitHubToken()).toBe('settings-token');
  });

  it('should return default OpenAI config when not specified', () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_MODEL;

    const config = getEffectiveOpenAIConfig();
    expect(config.apiKey).toBeUndefined();
    expect(config.baseUrl).toBe('https://api.openai.com/v1');
    expect(config.model).toBe('gpt-4o-mini');
  });
});
