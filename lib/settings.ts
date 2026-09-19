import fs from 'fs';
import path from 'path';

export interface AppSettings {
  githubToken?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
}

const SETTINGS_FILE_NAME = '.app-settings.json';

function getSettingsFilePath(): string {
  // Check if custom path is provided via env (e.g. Electron userData path)
  if (process.env.APP_SETTINGS_PATH) {
    return process.env.APP_SETTINGS_PATH;
  }
  return path.join(process.cwd(), SETTINGS_FILE_NAME);
}

/**
 * Loads settings from local storage file, falling back to process.env
 */
export function getSettings(): AppSettings {
  const filePath = getSettingsFilePath();
  let fileSettings: Partial<AppSettings> = {};

  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      const raw = fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf-8');
      fileSettings = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[Settings] Failed to read settings file:', err);
  }

  return {
    githubToken: fileSettings.githubToken || process.env.GITHUB_TOKEN || '',
    openaiApiKey: fileSettings.openaiApiKey || process.env.OPENAI_API_KEY || '',
    openaiBaseUrl: fileSettings.openaiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    openaiModel: fileSettings.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

/**
 * Saves settings to local storage file
 */
export function saveSettings(newSettings: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated: AppSettings = {
    ...current,
    ...newSettings,
  };

  const filePath = getSettingsFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
    // Also update process.env for runtime continuity
    if (updated.githubToken) process.env.GITHUB_TOKEN = updated.githubToken;
    if (updated.openaiApiKey) process.env.OPENAI_API_KEY = updated.openaiApiKey;
    if (updated.openaiBaseUrl) process.env.OPENAI_BASE_URL = updated.openaiBaseUrl;
    if (updated.openaiModel) process.env.OPENAI_MODEL = updated.openaiModel;
  } catch (err) {
    console.error('[Settings] Failed to write settings file:', err);
    throw new Error('Failed to save settings');
  }

  return updated;
}

/**
 * Get effective GitHub Token
 */
export function getEffectiveGitHubToken(): string | undefined {
  const settings = getSettings();
  const token = settings.githubToken || process.env.GITHUB_TOKEN;
  return token && token.trim() !== '' ? token.trim() : undefined;
}

/**
 * Get effective OpenAI configuration
 */
export function getEffectiveOpenAIConfig(): {
  apiKey?: string;
  baseUrl: string;
  model: string;
} {
  const settings = getSettings();
  const apiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY;
  const baseUrl = (settings.openaiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = settings.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  return {
    apiKey: apiKey && apiKey.trim() !== '' ? apiKey.trim() : undefined,
    baseUrl,
    model,
  };
}
