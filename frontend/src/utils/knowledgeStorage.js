/**
 * Client-side Knowledge Hub activity persistence (localStorage only).
 * BR-153 — v3 storage validates against agent-library catalog only.
 */

import { isValidAgentLibraryPath } from "./knowledgeDisplay.js";

const STORAGE_KEY_V3 = "atlas_knowledge_activity_v3";
const STORAGE_KEY_V2 = "atlas_knowledge_activity_v2";
const LEGACY_RECENT_KEY = "atlas_knowledge_recent_v1";
const MAX_LIST_SIZE = 12;

function emptyState() {
  return {
    recentlyOpened: [],
    recentlyViewed: [],
    pinned: [],
    favorites: [],
    viewCounts: {}
  };
}

function catalogMapFromFiles(files) {
  const map = new Map();
  for (const file of files || []) {
    if (file?.path) {
      map.set(file.path, file);
    }
  }
  return map;
}

function enrichEntryFromCatalog(entry, catalogMap) {
  if (!entry?.path) {
    return null;
  }
  const catalog = catalogMap.get(entry.path);
  if (!catalog) {
    return null;
  }
  return {
    path: entry.path,
    displayTitle: catalog.displayTitle || catalog.title,
    shortSummary: catalog.shortSummary || "",
    categoryId: catalog.categoryId || null,
    categoryLabelKey: catalog.categoryLabelKey || null,
    updatedAt: catalog.updatedAt || entry.updatedAt || null,
    estimatedReadTime: catalog.estimatedReadTime || null,
    savedAt: entry.savedAt || new Date().toISOString()
  };
}

function filterViewCounts(viewCounts, validPaths) {
  const next = {};
  for (const [path, count] of Object.entries(viewCounts || {})) {
    if (validPaths.has(path) && Number(count) > 0) {
      next[path] = Number(count);
    }
  }
  return next;
}

function sanitizeState(state, catalogMap) {
  const validPaths = new Set(catalogMap.keys());
  const sanitizeList = (list) =>
    (Array.isArray(list) ? list : [])
      .map((entry) => enrichEntryFromCatalog(entry, catalogMap))
      .filter(Boolean)
      .slice(0, MAX_LIST_SIZE);

  return {
    recentlyOpened: sanitizeList(state.recentlyOpened),
    recentlyViewed: sanitizeList(state.recentlyViewed),
    pinned: sanitizeList(state.pinned),
    favorites: sanitizeList(state.favorites),
    viewCounts: filterViewCounts(state.viewCounts, validPaths)
  };
}

function migrateLegacyRecent() {
  const state = emptyState();
  try {
    const legacyRaw = localStorage.getItem(LEGACY_RECENT_KEY);
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : [];
    if (Array.isArray(legacy) && legacy.length) {
      state.recentlyViewed = legacy.slice(0, MAX_LIST_SIZE);
      localStorage.removeItem(LEGACY_RECENT_KEY);
    }
  } catch {
    // ignore
  }
  return state;
}

function readLegacyV2State() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return {
      ...emptyState(),
      ...parsed
    };
  } catch {
    return null;
  }
}

function readRawState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V3);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...emptyState(),
        ...parsed
      };
    }
  } catch {
    // fall through
  }

  const legacyV2 = readLegacyV2State();
  if (legacyV2) {
    return legacyV2;
  }

  return migrateLegacyRecent();
}

function persistState(state) {
  try {
    localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(state));
    localStorage.removeItem(STORAGE_KEY_V2);
  } catch {
    // ignore quota errors
  }
}

function normalizeEntry(entry, catalogMap) {
  if (!entry?.path) {
    return null;
  }
  if (catalogMap?.size) {
    return enrichEntryFromCatalog(entry, catalogMap);
  }
  if (!isValidAgentLibraryPath(entry.path)) {
    return null;
  }
  return {
    path: entry.path,
    displayTitle: entry.displayTitle || entry.title || entry.path,
    shortSummary: entry.shortSummary || "",
    categoryId: entry.categoryId || null,
    categoryLabelKey: entry.categoryLabelKey || null,
    updatedAt: entry.updatedAt || null,
    estimatedReadTime: entry.estimatedReadTime || null,
    savedAt: new Date().toISOString()
  };
}

function upsertList(list, entry, catalogMap) {
  const normalized = normalizeEntry(entry, catalogMap);
  if (!normalized) {
    return list;
  }
  const next = [normalized, ...list.filter((item) => item.path !== normalized.path)];
  return next.slice(0, MAX_LIST_SIZE);
}

let catalogMapCache = new Map();

export function syncKnowledgeActivityWithCatalog(files) {
  catalogMapCache = catalogMapFromFiles(files);
  const current = readRawState();
  const sanitized = sanitizeState(current, catalogMapCache);
  persistState(sanitized);
  return sanitized;
}

export function readKnowledgeActivity(files = null) {
  if (Array.isArray(files) && files.length) {
    return syncKnowledgeActivityWithCatalog(files);
  }
  const state = readRawState();
  if (!catalogMapCache.size) {
    return state;
  }
  return sanitizeState(state, catalogMapCache);
}

export function recordRecentlyOpened(entry) {
  const state = readRawState();
  state.recentlyOpened = upsertList(state.recentlyOpened, entry, catalogMapCache);
  persistState(state);
  return state;
}

export function recordRecentlyViewed(entry) {
  const state = readRawState();
  state.recentlyViewed = upsertList(state.recentlyViewed, entry, catalogMapCache);
  if (entry?.path && isValidAgentLibraryPath(entry.path, catalogMapCache.size ? catalogMapCache : null)) {
    state.viewCounts = state.viewCounts || {};
    state.viewCounts[entry.path] = (state.viewCounts[entry.path] || 0) + 1;
  }
  persistState(state);
  return state;
}

export function getPopularArticles(files, { limit = 8 } = {}) {
  const state = readRawState();
  const counts = state.viewCounts || {};
  const catalogMap = catalogMapFromFiles(files);

  return (Array.isArray(files) ? files : [])
    .map((file) => ({
      ...file,
      popularity: counts[file.path] || 0
    }))
    .filter((file) => file.popularity > 0)
    .sort((a, b) => {
      if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
      }
      return (a.displayTitle || a.title || a.path).localeCompare(
        b.displayTitle || b.title || b.path
      );
    })
    .slice(0, limit)
    .map((file) => enrichEntryFromCatalog(file, catalogMap) || file);
}

export function toggleFavorite(entry) {
  const state = readRawState();
  const normalized = normalizeEntry(entry, catalogMapCache);
  if (!normalized) {
    return state;
  }
  const exists = state.favorites.some((item) => item.path === normalized.path);
  if (exists) {
    state.favorites = state.favorites.filter((item) => item.path !== normalized.path);
  } else {
    state.favorites = upsertList(state.favorites, normalized, catalogMapCache);
  }
  persistState(state);
  return state;
}

export function isFavorite(path, state = readRawState()) {
  return state.favorites.some((item) => item.path === path);
}

export function togglePinned(entry) {
  const state = readRawState();
  const normalized = normalizeEntry(entry, catalogMapCache);
  if (!normalized) {
    return state;
  }
  const exists = state.pinned.some((item) => item.path === normalized.path);
  if (exists) {
    state.pinned = state.pinned.filter((item) => item.path !== normalized.path);
  } else {
    state.pinned = upsertList(state.pinned, normalized, catalogMapCache);
  }
  persistState(state);
  return state;
}

export function isPinned(path, state = readRawState()) {
  return state.pinned.some((item) => item.path === path);
}
