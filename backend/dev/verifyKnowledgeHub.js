/**
 * Atlas Knowledge Hub verification.
 * Run: node backend/dev/verifyKnowledgeHub.js
 */

require("dotenv").config();

const {
  getKnowledgeTree,
  getKnowledgeDocument,
  resolveSafeDocumentPath,
  DEFAULT_DOCUMENT_PATH
} = require("../core/knowledgeHubService");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyTree() {
  const tree = getKnowledgeTree();

  assert(tree.root?.type === "folder", "Tree root must be a folder");
  assert(Array.isArray(tree.files) && tree.files.length > 0, "Tree must include markdown files");
  assert(tree.defaultPath === DEFAULT_DOCUMENT_PATH, "Default path must be CURRENT_STATE.md");
  assert(
    tree.files.some((file) => file.path === DEFAULT_DOCUMENT_PATH),
    "Default document must exist in tree"
  );
}

function verifyDocument() {
  const doc = getKnowledgeDocument(DEFAULT_DOCUMENT_PATH);

  assert(doc.path === DEFAULT_DOCUMENT_PATH, "Document path must match request");
  assert(typeof doc.content === "string" && doc.content.length > 0, "Document content required");
  assert(doc.title.length > 0, "Document title required");
}

function verifyPathTraversal() {
  const invalidPaths = ["../package.json", "../../.env", "foo/../../secret.md", "/etc/passwd.md"];

  for (const badPath of invalidPaths) {
    let threw = false;

    try {
      resolveSafeDocumentPath(badPath);
    } catch (error) {
      threw = true;
      assert(error.statusCode >= 400, `Expected rejection for ${badPath}`);
    }

    assert(threw, `Path traversal must be rejected: ${badPath}`);
  }
}

async function main() {
  verifyTree();
  verifyDocument();
  verifyPathTraversal();
  console.log("verifyKnowledgeHub: all checks passed");
}

main().catch((error) => {
  console.error("verifyKnowledgeHub failed:", error.message);
  process.exit(1);
});
