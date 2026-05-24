const os = require('os');

/**
 * Standardized OS detection utility.
 * Returns the current platform name in a consistent format.
 * Possible values: 'windows', 'macos', 'linux', 'unknown'
 */
function getOS() {
  const platform = process.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  return 'unknown';
}

/**
 * Checks if the current OS matches the target OS.
 * @param {string} targetOS - 'windows', 'macos', or 'linux'
 * @returns {boolean}
 */
function isOS(targetOS) {
  return getOS() === targetOS.toLowerCase();
}

module.exports = {
  getOS,
  isOS,
  platform: process.platform
};
