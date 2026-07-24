/**
 * Knowledge Hub document search — keyword strategy today, semantic-ready tomorrow.
 */

export const SEARCH_STRATEGY = "keyword";

const FIELD_WEIGHTS = {
  title: 5,
  name: 4,
  folder: 3,
  path: 2
};

function tokenize(query) {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function scoreField(value, terms) {
  if (!value) {
    return 0;
  }

  const haystack = value.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (haystack === term) {
      score += 3;
    } else if (haystack.startsWith(term)) {
      score += 2;
    } else if (haystack.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function scoreFile(file, terms) {
  let total = 0;

  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    total += scoreField(file[field], terms) * weight;
  }

  return total;
}

/**
 * Search files by filename, title, folder, and path (partial matches).
 * Replace implementation with embedding/semantic strategy in Phase 2.
 */
export function searchKnowledgeFiles(files, query) {
  const terms = tokenize(query);

  if (!terms.length || !Array.isArray(files)) {
    return [];
  }

  return files
    .map((file) => ({
      file,
      score: scoreFile(file, terms)
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return (a.file.path || "").localeCompare(b.file.path || "");
    })
    .map(({ file }) => file);
}
