const CHUNK_SIZE = 2000;

export interface ParsedDocument {
  filename: string;
  totalPages: number;
  wordCount: number;
  pages: string[];
}

// Groups paragraphs into chunks of roughly CHUNK_SIZE characters.
function chunkByParagraphs(text: string) {
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of text.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    let rest = paragraph.trim();
    while (rest.length > CHUNK_SIZE) {
      const cut = rest.lastIndexOf(" ", CHUNK_SIZE);
      const at = cut > 0 ? cut : CHUNK_SIZE;
      flush();
      chunks.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (current && current.length + rest.length + 2 > CHUNK_SIZE) flush();
    current = current ? `${current}\n\n${rest}` : rest;
  }
  flush();
  return chunks.filter(Boolean);
}

async function extractPdfPages(buffer: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = `${
    process.env.NEXT_PUBLIC_BASE_PATH ?? "/translator"
  }/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const text: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let pageText = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        pageText += item.str + (item.hasEOL ? "\n" : " ");
      }
      text.push(pageText.trim());
    }
  } finally {
    await doc.destroy();
  }
  return chunkByParagraphs(text.filter(Boolean).join("\n\n"));
}

export async function parseDocumentClient(file: File): Promise<ParsedDocument> {
  const filename = file.name;
  const ext = filename.split(".").pop()?.toLowerCase();

  let pages: string[];
  try {
    if (ext === "txt") {
      pages = chunkByParagraphs(await file.text());
    } else if (ext === "docx") {
      const mammoth = (await import("mammoth/mammoth.browser")).default;
      const result = await mammoth.extractRawText({
        arrayBuffer: await file.arrayBuffer(),
      });
      pages = chunkByParagraphs(result.value);
    } else if (ext === "pdf") {
      pages = await extractPdfPages(await file.arrayBuffer());
    } else {
      throw new Error("Unsupported file type. Use .pdf, .docx or .txt.");
    }
  } catch (err) {
    if (ext !== "txt" && ext !== "docx" && ext !== "pdf") throw err;
    throw new Error(
      `Failed to parse ${ext.toUpperCase()} file: it may be corrupted or invalid.`
    );
  }

  const wordCount = pages.reduce(
    (sum, p) => sum + p.split(/\s+/).filter(Boolean).length,
    0
  );
  return { filename, totalPages: pages.length, wordCount, pages };
}
