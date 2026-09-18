/**
 * Environment validation helper
 * 
 * Validates required environment variables on server startup
 * and provides clear error messages for missing configuration.
 * 
 * @file env.ts
 */

/**
 * Interface for environment variable configuration
 */
interface EnvConfig {
  GITHUB_TOKEN?: string;
  [key: string]: string | undefined;
}

/**
 * Required environment variables for the application
 */
const REQUIRED_ENV_VARS: string[] = ['GITHUB_TOKEN'];

/**
 * Application name for error messages
 */
const APPLICATION_NAME = 'GitHub Commit Activity Tracker';

/**
 * Checks if all required environment variables are set
 * 
 * @throws {Error} If any required environment variable is missing
 */
export function validateEnvironment(): void {
  const missingVars: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missingVars.push(envVar);
    }
  }

  if (missingVars.length > 0) {
    const errorMessage = generateErrorMessage(missingVars);
    throw new Error(errorMessage);
  }
}

/**
 * Gets the GitHub token from environment variables
 * 
 * @returns {string | undefined} The GitHub token if set, undefined otherwise
 */
export function getGitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN;
}

/**
 * Validates that the GitHub token is present and not empty
 * 
 * @throws {Error} If the GitHub token is not configured or empty
 */
export function validateGitHubToken(): void {
  const token = process.env.GITHUB_TOKEN;

  if (token === undefined || token === null) {
    throw new Error(
      `${APPLICATION_NAME}: GitHub token is not configured. ` +
      'Please set the GITHUB_TOKEN environment variable. ' +
      'Token must have the following scopes: repo, user:email, read:user'
    );
  }

  if (token.trim() === '') {
    throw new Error(
      `${APPLICATION_NAME}: GitHub token is configured but empty. ` +
      'Please set a valid GitHub Personal Access Token in the GITHUB_TOKEN environment variable. ' +
      'Token must have the following scopes: repo, user:email, read:user'
    );
  }
}

/**
 * Generates a clear error message for missing environment variables
 * 
 * @param {string[]} missingVars - Array of missing environment variable names
 * @returns {string} Formatted error message
 */
function generateErrorMessage(missingVars: string[]): string {
  const variableList = missingVars.join(', ');
  const article = missingVars.length === 1 ? 'a' : 'some';
  
  return (
    `${APPLICATION_NAME} cannot start because the following environment variables are not configured:\n\n` +
    `  ${variableList}\n\n` +
    `Please set ${article} of the above variables before starting the application.\n` +
    `Refer to the .env.local.example file for configuration instructions.\n` +
    `Missing required configuration: ${missingVars.length === 1 ? 'This variable is' : 'These variables are'} ` +
    `required for ${APPLICATION_NAME.toLowerCase()} to authenticate with the GitHub API.`
  );
}

/**
 * Validates the environment and logs success message if all variables are set
 * 
 * @returns {boolean} True if environment is valid, false otherwise
 */
export function checkEnvironmentAndLog(): boolean {
  try {
    validateEnvironment();
    console.log(`${APPLICATION_NAME}: Environment validation passed`);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export default {
  validateEnvironment,
  getGitHubToken,
  validateGitHubToken,
  checkEnvironmentAndLog,
};
