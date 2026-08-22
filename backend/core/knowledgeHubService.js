/**
 * Atlas Knowledge Hub — read-only agent reference library under docs/agent-library.
 * BR-154 — locale-specific article variants (no mixed-language fields).
 */

const fs = require("fs");
const path = require("path");
const {
  KNOWLEDGE_HUB_CATEGORIES,
  resolveCategoryForPath
} = require("./knowledgeHubCategories");
const { buildArticleMetadata } = require("./knowledgeHubArticleMetadata");
const {
  DEFAULT_LOCALE,
  normalizeKnowledgeLocale,
  parseLocalizedFilename,
  buildArticlePath,
  normalizeArticlePath,
  resolveArticleDiskPath
} = require("./knowledgeHubLocales");

const AGENT_LIBRARY_ROOT = path.resolve(__dirname, "../../docs/agent-library");
const DEFAULT_DOCUMENT_PATH = "quick-reference/what-do-i-do-next";

function isLocaleMarkdownFile(name) {
  return parseLocalizedFilename(name) !== null;
}

function toPosixRelative(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    return { body: content, meta: {} };
  }

  const meta = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }

  return {
    body: content.slice(match[0].length),
    meta
  };
}

function resolveSafeDocumentPath(relativePath, locale = DEFAULT_LOCALE) {
  if (!relativePath || typeof relativePath !== "string") {
    throw Object.assign(new Error("Document path is required."), {
      statusCode: 400,
      publicCode: "PATH_REQUIRED"
    });
  }

  const normalizedLocale = normalizeKnowledgeLocale(locale);
  const articlePath = normalizeArticlePath(relativePath);

  if (!articlePath || articlePath.includes("..") || path.isAbsolute(articlePath)) {
    throw Object.assign(new Error("Invalid document path."), {
      statusCode: 400,
      publicCode: "INVALID_PATH"
    });
  }

  const diskRelativePath = resolveArticleDiskPath(articlePath, normalizedLocale);
  const absolutePath = path.resolve(AGENT_LIBRARY_ROOT, diskRelativePath);
  const relativeToRoot = path.relative(AGENT_LIBRARY_ROOT, absolutePath);

  if (
    relativeToRoot.startsWith("..") ||
    path.isAbsolute(relativeToRoot) ||
    relativeToRoot.includes(`..${path.sep}`)
  ) {
    throw Object.assign(new Error("Document path escapes the agent library root."), {
      statusCode: 403,
      publicCode: "PATH_TRAVERSAL"
    });
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw Object.assign(new Error("Document not found for requested language."), {
      statusCode: 404,
      publicCode: "LOCALE_NOT_AVAILABLE"
    });
  }

  return {
    articlePath,
    diskRelativePath: toPosixRelative(relativeToRoot),
    absolutePath,
    locale: normalizedLocale
  };
}

function buildFileNode({ articlePath, diskFilename, absoluteFile, locale }) {
  const stats = fs.statSync(absoluteFile);
  const rawContent = fs.readFileSync(absoluteFile, "utf8");
  const { body, meta } = parseFrontmatter(rawContent);
  const folderDir = path.posix.dirname(articlePath);
  const folder = folderDir === "." ? "" : folderDir;
  const category = resolveCategoryForPath(articlePath);
  const metadata = buildArticleMetadata({
    meta,
    body,
    filename: diskFilename,
    category
  });

  return {
    type: "file",
    name: path.basename(articlePath),
    path: articlePath,
    locale,
    folder,
    categoryId: metadata.categoryId,
    categoryFolder: category?.folder || folder,
    categoryLabelKey: metadata.categoryLabelKey,
    displayTitle: metadata.displayTitle,
    shortSummary: metadata.shortSummary,
    estimatedReadTime: metadata.estimatedReadTime,
    title: metadata.displayTitle,
    keywords: metadata.keywords,
    updatedAt: stats.mtime.toISOString()
  };
}

function indexCategoryArticles(categoryDef) {
  const categoryDir = path.join(AGENT_LIBRARY_ROOT, categoryDef.folder);
  const articles = new Map();

  if (!fs.existsSync(categoryDir) || !fs.statSync(categoryDir).isDirectory()) {
    return articles;
  }

  for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
    if (!entry.isFile() || !isLocaleMarkdownFile(entry.name)) {
      continue;
    }

    const parsed = parseLocalizedFilename(entry.name);
    if (!parsed) {
      continue;
    }

    const articlePath = buildArticlePath(categoryDef.folder, parsed.slug);
    if (!articles.has(articlePath)) {
      articles.set(articlePath, {});
    }
    articles.get(articlePath)[parsed.locale] = entry.name;
  }

  return articles;
}

function buildCategoryDirectoryNode(categoryDef, locale) {
  const categoryDir = path.join(AGENT_LIBRARY_ROOT, categoryDef.folder);
  const indexed = indexCategoryArticles(categoryDef);

  if (!fs.existsSync(categoryDir) || !fs.statSync(categoryDir).isDirectory()) {
    return {
      type: "folder",
      name: categoryDef.folder,
      path: categoryDef.folder,
      categoryId: categoryDef.id,
      children: []
    };
  }

  const entries = [...indexed.entries()]
    .filter(([, variants]) => variants[locale])
    .map(([articlePath, variants]) => {
      const diskFilename = variants[locale];
      const absoluteFile = path.join(categoryDir, diskFilename);
      return buildFileNode({
        articlePath,
        diskFilename,
        absoluteFile,
        locale
      });
    })
    .sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, undefined, { sensitivity: "base" }));

  return {
    type: "folder",
    name: categoryDef.folder,
    path: categoryDef.folder,
    categoryId: categoryDef.id,
    children: entries
  };
}

function flattenFiles(node, accumulator = []) {
  if (node.type === "file") {
    accumulator.push({
      path: node.path,
      name: node.name,
      locale: node.locale,
      folder: node.folder,
      categoryId: node.categoryId,
      categoryFolder: node.categoryFolder,
      categoryLabelKey: node.categoryLabelKey,
      displayTitle: node.displayTitle,
      shortSummary: node.shortSummary,
      estimatedReadTime: node.estimatedReadTime,
      title: node.displayTitle || node.title,
      keywords: node.keywords || [],
      updatedAt: node.updatedAt
    });
    return accumulator;
  }

  for (const child of node.children || []) {
    flattenFiles(child, accumulator);
  }

  return accumulator;
}

function getKnowledgeTree({ locale = DEFAULT_LOCALE } = {}) {
  const resolvedLocale = normalizeKnowledgeLocale(locale);
  const categoryNodes = KNOWLEDGE_HUB_CATEGORIES.map((category) =>
    buildCategoryDirectoryNode(category, resolvedLocale)
  );
  const files = categoryNodes
    .flatMap((node) => flattenFiles(node))
    .sort((a, b) => a.path.localeCompare(b.path));

  const categories = KNOWLEDGE_HUB_CATEGORIES.map((category) => {
    const categoryFiles = files.filter((file) => file.categoryId === category.id);
    const latestUpdatedAt = categoryFiles.reduce((latest, file) => {
      if (!file.updatedAt) {
        return latest;
      }
      if (!latest || file.updatedAt > latest) {
        return file.updatedAt;
      }
      return latest;
    }, null);

    return {
      id: category.id,
      folder: category.folder,
      labelKey: category.labelKey,
      descriptionKey: category.descriptionKey,
      order: category.order,
      articleCount: categoryFiles.length,
      latestUpdatedAt
    };
  });

  return {
    root: {
      type: "folder",
      name: "agent-library",
      path: "",
      children: categoryNodes
    },
    files,
    categories,
    locale: resolvedLocale,
    defaultPath: DEFAULT_DOCUMENT_PATH,
    docsRoot: "docs/agent-library",
    libraryType: "agent-reference"
  };
}

function getKnowledgeDocument(relativePath, { locale = DEFAULT_LOCALE } = {}) {
  const {
    articlePath,
    absolutePath,
    locale: resolvedLocale
  } = resolveSafeDocumentPath(relativePath, locale);
  const rawContent = fs.readFileSync(absolutePath, "utf8");
  const { body, meta } = parseFrontmatter(rawContent);
  const stats = fs.statSync(absolutePath);
  const category = resolveCategoryForPath(articlePath);
  const metadata = buildArticleMetadata({
    meta,
    body,
    filename: path.basename(absolutePath),
    category
  });

  return {
    path: articlePath,
    locale: resolvedLocale,
    name: path.basename(articlePath),
    folder: (() => {
      const dir = path.posix.dirname(articlePath);
      return dir === "." ? "" : dir;
    })(),
    categoryId: metadata.categoryId,
    categoryFolder: category?.folder || null,
    categoryLabelKey: metadata.categoryLabelKey,
    displayTitle: metadata.displayTitle,
    shortSummary: metadata.shortSummary,
    estimatedReadTime: metadata.estimatedReadTime,
    title: metadata.displayTitle,
    keywords: metadata.keywords,
    content: body,
    updatedAt: stats.mtime.toISOString()
  };
}

module.exports = {
  AGENT_LIBRARY_ROOT,
  DEFAULT_DOCUMENT_PATH,
  resolveSafeDocumentPath,
  getKnowledgeTree,
  getKnowledgeDocument,
  parseFrontmatter
};
