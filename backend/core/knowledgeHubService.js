/**
 * Atlas Knowledge Hub — read-only access to /docs (filesystem source of truth).
 */

const fs = require("fs");
const path = require("path");

const DOCS_ROOT = path.resolve(__dirname, "../../docs");
const DEFAULT_DOCUMENT_PATH = "CURRENT_STATE.md";

function isMarkdownFile(name) {
  return name.endsWith(".md") && !name.startsWith(".");
}

function toPosixRelative(relativePath) {
  return relativePath.split(path.sep).join("/");
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

  const absolutePath = path.resolve(DOCS_ROOT, normalizedInput);
  const relativeToRoot = path.relative(DOCS_ROOT, absolutePath);

  if (
    relativeToRoot.startsWith("..") ||
    path.isAbsolute(relativeToRoot) ||
    relativeToRoot.includes(`..${path.sep}`)
  ) {
    throw Object.assign(new Error("Document path escapes the docs root."), {
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

function buildDirectoryNode(relativeDir = "") {
  const absoluteDir = relativeDir ? path.join(DOCS_ROOT, relativeDir) : DOCS_ROOT;
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });

  const children = entries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => {
      const entryRelative = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      const posixPath = toPosixRelative(entryRelative);

      if (entry.isDirectory()) {
        return buildDirectoryNode(entryRelative);
      }

      if (!entry.isFile() || !isMarkdownFile(entry.name)) {
        return null;
      }

      const absoluteFile = path.join(absoluteDir, entry.name);
      const stats = fs.statSync(absoluteFile);
      const content = fs.readFileSync(absoluteFile, "utf8");

      return {
        type: "file",
        name: entry.name,
        path: posixPath,
        title: extractTitle(content, entry.name),
        updatedAt: stats.mtime.toISOString()
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") {
        return -1;
      }

      if (a.type !== "folder" && b.type === "folder") {
        return 1;
      }

      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

  return {
    type: "folder",
    name: relativeDir ? path.basename(relativeDir) : "docs",
    path: relativeDir ? toPosixRelative(relativeDir) : "",
    children
  };
}

function flattenFiles(node, accumulator = []) {
  if (node.type === "file") {
    accumulator.push({
      path: node.path,
      name: node.name,
      title: node.title,
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
  const tree = buildDirectoryNode();
  const files = flattenFiles(tree).sort((a, b) => a.path.localeCompare(b.path));

  return {
    root: tree,
    files,
    defaultPath: DEFAULT_DOCUMENT_PATH,
    docsRoot: "docs"
  };
}

function getKnowledgeDocument(relativePath) {
  const { relativePath: safePath, absolutePath } = resolveSafeDocumentPath(relativePath);
  const content = fs.readFileSync(absolutePath, "utf8");
  const stats = fs.statSync(absolutePath);

  return {
    path: safePath,
    name: path.basename(safePath),
    title: extractTitle(content, path.basename(safePath)),
    content,
    updatedAt: stats.mtime.toISOString()
  };
}

module.exports = {
  DOCS_ROOT,
  DEFAULT_DOCUMENT_PATH,
  resolveSafeDocumentPath,
  getKnowledgeTree,
  getKnowledgeDocument
};
