/**
 * Atlas Knowledge Hub — read-only agent reference library under docs/agent-library.
 */

const fs = require("fs");
const path = require("path");
const {
  KNOWLEDGE_HUB_CATEGORIES,
  resolveCategoryForPath
} = require("./knowledgeHubCategories");
const { buildArticleMetadata } = require("./knowledgeHubArticleMetadata");

const AGENT_LIBRARY_ROOT = path.resolve(__dirname, "../../docs/agent-library");
const DEFAULT_DOCUMENT_PATH = "quick-reference/what-do-i-do-next.md";

function isMarkdownFile(name) {
  return name.endsWith(".md") && !name.startsWith(".");
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

function resolveSafeDocumentPath(relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    throw Object.assign(new Error("Document path is required."), {
      statusCode: 400,
      publicCode: "PATH_REQUIRED"
    });
  }

  const normalizedInput = relativePath.trim().replace(/\\/g, "/");

  if (!normalizedInput || normalizedInput.includes("..") || path.isAbsolute(normalizedInput)) {
    throw Object.assign(new Error("Invalid document path."), {
      statusCode: 400,
      publicCode: "INVALID_PATH"
    });
  }

  if (!isMarkdownFile(normalizedInput)) {
    throw Object.assign(new Error("Only Markdown documents are allowed."), {
      statusCode: 400,
      publicCode: "INVALID_EXTENSION"
    });
  }

  const absolutePath = path.resolve(AGENT_LIBRARY_ROOT, normalizedInput);
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
    throw Object.assign(new Error("Document not found."), {
      statusCode: 404,
      publicCode: "NOT_FOUND"
    });
  }

  return {
    relativePath: toPosixRelative(relativeToRoot),
    absolutePath
  };
}

function extractTitle(markdown, fallbackName) {
  const match = markdown.match(/^#\s+(.+)$/m);

  if (match?.[1]) {
    return match[1].trim();
  }

  return fallbackName.replace(/\.md$/i, "").replace(/[-_]/g, " ");
}

function buildFileNode(relativeFilePath, absoluteFile) {
  const stats = fs.statSync(absoluteFile);
  const rawContent = fs.readFileSync(absoluteFile, "utf8");
  const { body, meta } = parseFrontmatter(rawContent);
  const posixPath = toPosixRelative(relativeFilePath);
  const folderDir = path.posix.dirname(posixPath);
  const folder = folderDir === "." ? "" : folderDir;
  const category = resolveCategoryForPath(posixPath);
  const metadata = buildArticleMetadata({
    meta,
    body,
    filename: path.basename(posixPath),
    category
  });

  return {
    type: "file",
    name: path.basename(posixPath),
    path: posixPath,
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

function buildCategoryDirectoryNode(categoryDef) {
  const categoryDir = path.join(AGENT_LIBRARY_ROOT, categoryDef.folder);

  if (!fs.existsSync(categoryDir) || !fs.statSync(categoryDir).isDirectory()) {
    return {
      type: "folder",
      name: categoryDef.folder,
      path: categoryDef.folder,
      categoryId: categoryDef.id,
      children: []
    };
  }

  const entries = fs
    .readdirSync(categoryDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isMarkdownFile(entry.name))
    .map((entry) => {
      const relativeFile = path.join(categoryDef.folder, entry.name);
      return buildFileNode(relativeFile, path.join(categoryDir, entry.name));
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

function getKnowledgeTree() {
  const categoryNodes = KNOWLEDGE_HUB_CATEGORIES.map(buildCategoryDirectoryNode);
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
    defaultPath: DEFAULT_DOCUMENT_PATH,
    docsRoot: "docs/agent-library",
    libraryType: "agent-reference"
  };
}

function getKnowledgeDocument(relativePath) {
  const { relativePath: safePath, absolutePath } = resolveSafeDocumentPath(relativePath);
  const rawContent = fs.readFileSync(absolutePath, "utf8");
  const { body, meta } = parseFrontmatter(rawContent);
  const stats = fs.statSync(absolutePath);
  const category = resolveCategoryForPath(safePath);
  const metadata = buildArticleMetadata({
    meta,
    body,
    filename: path.basename(safePath),
    category
  });

  return {
    path: safePath,
    name: path.basename(safePath),
    folder: (() => {
      const dir = path.posix.dirname(safePath);
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
