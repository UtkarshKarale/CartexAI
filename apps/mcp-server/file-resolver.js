const os = require('os');
const fs = require('fs/promises');
const path = require('path');

const HOME = os.homedir();

const DIR_HINTS = {
  desktop: `${HOME}/Desktop`,
  downloads: `${HOME}/Downloads`,
  download: `${HOME}/Downloads`,
  documents: `${HOME}/Documents`,
  pictures: `${HOME}/Pictures`,
  videos: `${HOME}/Videos`,
  music: `${HOME}/Music`,
  home: HOME,
};

function extractDirHint(query) {
  for (const [keyword, dirPath] of Object.entries(DIR_HINTS)) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(query)) {
      return dirPath;
    }
  }
  return null;
}

function fuzzyMatch(filename, candidates) {
  const lower = filename.toLowerCase();
  const exact = candidates.find(c => c.toLowerCase() === lower);
  if (exact) return exact;
  const contains = candidates.find(c => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase()));
  return contains ?? null;
}

async function resolveFilePath(query, hintedPath) {
  if (hintedPath && hintedPath.startsWith('/')) {
    try {
      await fs.access(hintedPath);
      return hintedPath;
    } catch {
      // file not found at hinted path — try to resolve
    }
  }

  const dir = extractDirHint(query);
  if (!dir) return hintedPath;

  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return hintedPath;
  }

  const filename = hintedPath ? path.basename(hintedPath) : null;
  if (!filename) return hintedPath;

  const match = fuzzyMatch(filename, entries);
  return match ? path.join(dir, match) : path.join(dir, filename);
}

module.exports = { resolveFilePath, extractDirHint };