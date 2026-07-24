/**
 * Client-side Knowledge Hub activity persistence (localStorage only).
 */

const STORAGE_KEY_V2 = "atlas_knowledge_activity_v2";
const LEGACY_RECENT_KEY = "atlas_knowledge_recent_v1";
const MAX_LIST_SIZE = 12;

function emptyState() {
  return {
    recentlyOpened: [],
    recentlyViewed: [],
    pinned: [],
    favorites: []
  };
}

function readRawState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...emptyState(),
        ...parsed
      };
    }
  } catch {
    // fall through to migration
  }

  return migrateLegacyRecent();
}

function migrateLegacyRecent() {
  const state = emptyState();

  try {
    const legacyRaw = localStorage.getItem(LEGACY_RECENT_KEY);
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : [];

    if (Array.isArray(legacy) && legacy.length) {
      state.recentlyViewed = legacy.slice(0, MAX_LIST_SIZE);
      persistState(state);
      localStorage.removeItem(LEGACY_RECENT_KEY);
    }
  } catch {
    // ignore
  }

  return state;
}

function persistState(state) {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function normalizeEntry(entry) {
  if (!entry?.path) {
    return null;
  }

  return {
    path: entry.path,
    title: entry.title || entry.path,
    updatedAt: entry.updatedAt || null,
    savedAt: new Date().toISOString()
  };
}

function upsertList(list, entry) {
  const normalized = normalizeEntry(entry);

  if (!normalized) {
    return list;
  }

  const next = [normalized, ...list.filter((item) => item.path !== normalized.path)];
  return next.slice(0, MAX_LIST_SIZE);
}

export function readKnowledgeActivity() {
  return readRawState();
}

export function recordRecentlyOpened(entry) {
  const state = readRawState();
  state.recentlyOpened = upsertList(state.recentlyOpened, entry);
  persistState(state);
  return state;
}

export function recordRecentlyViewed(entry) {
  const state = readRawState();
  state.recentlyViewed = upsertList(state.recentlyViewed, entry);
  persistState(state);
  return state;
}

export function toggleFavorite(entry) {
  const state = readRawState();
  const normalized = normalizeEntry(entry);

  if (!normalized) {
    return state;
  }

  const exists = state.favorites.some((item) => item.path === normalized.path);

  if (exists) {
    state.favorites = state.favorites.filter((item) => item.path !== normalized.path);
  } else {
    state.favorites = upsertList(state.favorites, normalized);
  }

  persistState(state);
  return state;
}

export function isFavorite(path, state = readRawState()) {
  return state.favorites.some((item) => item.path === path);
}

export function togglePinned(entry) {
  const state = readRawState();
  const normalized = normalizeEntry(entry);

  if (!normalized) {
    return state;
  }

  const exists = state.pinned.some((item) => item.path === normalized.path);

  if (exists) {
    state.pinned = state.pinned.filter((item) => item.path !== normalized.path);
  } else {
    state.pinned = upsertList(state.pinned, normalized);
  }

  persistState(state);
  return state;
}

export function isPinned(path, state = readRawState()) {
  return state.pinned.some((item) => item.path === path);
}
