/**
 * BR-207 — Sidebar information architecture.
 * Groups already-permitted nav items. Does not change routes or RBAC.
 */

import { appPath } from "../config/appRoutes.js";

export const SIDEBAR_NAV_GROUPS = Object.freeze({
  PIPELINE: "pipeline",
  PEOPLE_OUTCOMES: "peopleOutcomes",
  INTELLIGENCE: "intelligence",
  GROWTH: "growth"
});

export const SIDEBAR_GROUP_ORDER = Object.freeze([
  SIDEBAR_NAV_GROUPS.PIPELINE,
  SIDEBAR_NAV_GROUPS.PEOPLE_OUTCOMES,
  SIDEBAR_NAV_GROUPS.INTELLIGENCE,
  SIDEBAR_NAV_GROUPS.GROWTH
]);

export const SIDEBAR_GROUP_LABEL_KEYS = Object.freeze({
  [SIDEBAR_NAV_GROUPS.PIPELINE]: "navGroupPipeline",
  [SIDEBAR_NAV_GROUPS.PEOPLE_OUTCOMES]: "navGroupPeopleOutcomes",
  [SIDEBAR_NAV_GROUPS.INTELLIGENCE]: "navGroupIntelligence",
  [SIDEBAR_NAV_GROUPS.GROWTH]: "navGroupGrowth"
});

export const SIDEBAR_NAV_GROUPS_STORAGE_KEY = "atlas.sidebar.navGroups.v1";

/** Reserved People & Outcomes destination. Do not add until a page exists. */
export const RECOMMENDED_RECRUITS_PATH = appPath("recruits");

const TOP_LEVEL_PATHS = Object.freeze([
  appPath("executive-dashboard"),
  appPath("team-dashboard"),
  appPath("my-dashboard"),
  appPath("quick-capture")
]);

const GROUP_PATHS = Object.freeze({
  [SIDEBAR_NAV_GROUPS.PIPELINE]: Object.freeze([
    appPath("mission-control"),
    appPath("prospect-center"),
    appPath("conversations"),
    appPath("today"),
    appPath("appointments"),
    appPath("follow-ups")
  ]),
  [SIDEBAR_NAV_GROUPS.PEOPLE_OUTCOMES]: Object.freeze([
    appPath("clients"),
    appPath("production"),
    appPath("service")
  ]),
  [SIDEBAR_NAV_GROUPS.INTELLIGENCE]: Object.freeze([
    appPath("knowledge"),
    appPath("policy-intelligence"),
    appPath("policy-reviews")
  ]),
  [SIDEBAR_NAV_GROUPS.GROWTH]: Object.freeze([
    appPath("recruiting"),
    appPath("tiktok-live-engagements")
  ])
});

const PATH_TO_GROUP = Object.freeze(
  Object.fromEntries(
    SIDEBAR_GROUP_ORDER.flatMap((groupId) =>
      GROUP_PATHS[groupId].map((path) => [path, groupId])
    )
  )
);

function defaultExpandedState() {
  return Object.fromEntries(SIDEBAR_GROUP_ORDER.map((id) => [id, true]));
}

export function pathMatchesNavItem(itemPath, pathname) {
  const target = String(itemPath || "");
  const current = String(pathname || "");
  if (!target || !current) {
    return false;
  }
  return current === target || current.startsWith(`${target}/`);
}

function itemByPath(items, path) {
  return items.find((item) => item.path === path) || null;
}

export function buildSidebarNavModel(navItems = []) {
  const items = Array.isArray(navItems) ? navItems : [];
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    if (!item?.path || seen.has(item.path)) {
      continue;
    }
    seen.add(item.path);
    unique.push(item);
  }

  const topLevel = TOP_LEVEL_PATHS.map((path) => itemByPath(unique, path)).filter(Boolean);
  const groupedPaths = new Set(Object.keys(PATH_TO_GROUP));
  const topPaths = new Set(TOP_LEVEL_PATHS);

  const groups = SIDEBAR_GROUP_ORDER.map((id) => {
    const children = GROUP_PATHS[id].map((path) => itemByPath(unique, path)).filter(Boolean);
    return {
      id,
      labelKey: SIDEBAR_GROUP_LABEL_KEYS[id],
      children
    };
  }).filter((group) => group.children.length > 0);

  const trailing = unique.filter(
    (item) => !topPaths.has(item.path) && !groupedPaths.has(item.path)
  );

  return {
    topLevel,
    groups,
    trailing,
    allItems: unique
  };
}

export function resolveActiveGroupId(pathname, model) {
  const groups = model?.groups || [];
  for (const group of groups) {
    if (group.children.some((item) => pathMatchesNavItem(item.path, pathname))) {
      return group.id;
    }
  }
  return null;
}

export function isGroupActive(group, pathname) {
  return (group?.children || []).some((item) => pathMatchesNavItem(item.path, pathname));
}

export function readSidebarGroupState(storage) {
  const fallback = defaultExpandedState();
  if (!storage || typeof storage.getItem !== "function") {
    return fallback;
  }

  try {
    const raw = storage.getItem(SIDEBAR_NAV_GROUPS_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }
    return SIDEBAR_GROUP_ORDER.reduce((state, id) => {
      state[id] = parsed[id] !== false;
      return state;
    }, defaultExpandedState());
  } catch {
    return fallback;
  }
}

export function writeSidebarGroupState(state, storage) {
  if (!storage || typeof storage.setItem !== "function") {
    return state;
  }
  const next = {
    ...defaultExpandedState(),
    ...(state && typeof state === "object" ? state : {})
  };
  storage.setItem(SIDEBAR_NAV_GROUPS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function toggleSidebarGroupState(state, groupId) {
  if (!SIDEBAR_GROUP_ORDER.includes(groupId)) {
    return { ...defaultExpandedState(), ...(state || {}) };
  }
  const current = { ...defaultExpandedState(), ...(state || {}) };
  return { ...current, [groupId]: !current[groupId] };
}

export function expandActiveSidebarGroup(state, pathname, model) {
  const next = { ...defaultExpandedState(), ...(state || {}) };
  const activeGroupId = resolveActiveGroupId(pathname, model);
  if (activeGroupId) {
    next[activeGroupId] = true;
  }
  return next;
}

export function collectSidebarHrefs(model) {
  return [
    ...(model?.topLevel || []),
    ...(model?.groups || []).flatMap((group) => group.children),
    ...(model?.trailing || [])
  ].map((item) => item.path);
}
