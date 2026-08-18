/**
 * Digital PDF text extraction (BR-060).
 * Reads content streams only — no OCR, no GPT, no invented glyphs.
 */

async function loadPdfJs() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

function joinTextItems(items = []) {
  const parts = [];
  let lastY = null;

  for (const item of items) {
    const str = String(item?.str || "");
    const y = Array.isArray(item?.transform) ? item.transform[5] : null;

    if (lastY != null && y != null && Math.abs(lastY - y) > 2) {
      parts.push("\n");
    } else if (parts.length && !parts[parts.length - 1].endsWith("\n") && str) {
      parts.push(" ");
    }

    parts.push(str);
    if (y != null) {
      lastY = y;
    }
  }

  return parts.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * @param {Buffer|Uint8Array} buffer
 * @returns {Promise<{ pages: Array<{ page: number, text: string }>, pageCount: number, hasText: boolean, ocr: false }>}
 */
async function extractPdfTextPages(buffer) {
  if (!buffer || !buffer.length) {
    return { pages: [], pageCount: 0, hasText: false, ocr: false, reason: "empty_buffer" };
  }

  const bytes = buffer instanceof Uint8Array && !Buffer.isBuffer(buffer)
    ? buffer
    : new Uint8Array(buffer);
  const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");
  if (!header.startsWith("%PDF")) {
    return { pages: [], pageCount: 0, hasText: false, ocr: false, reason: "not_pdf" };
  }

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true
  });
  const doc = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push({
      page: pageNumber,
      text: joinTextItems(content.items)
    });
  }

  const hasText = pages.some((page) => String(page.text || "").trim().length > 40);

  return {
    pages,
    pageCount: doc.numPages,
    hasText,
    ocr: false,
    reason: hasText ? null : "no_extractable_text"
  };
}

module.exports = {
  extractPdfTextPages
};
