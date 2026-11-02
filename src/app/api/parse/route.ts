import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export const runtime = "nodejs";

class BadRequestError extends Error {}

const PAGE_BREAK = "\n--- PAGE BREAK ---\n";
const CHUNK_SIZE = 2000;

// Groups paragraphs into chunks of roughly CHUNK_SIZE characters.
function chunkByParagraphs(text: string) {
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of text.split(/\n\s*\n/)) {
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

export async function POST(request: Request) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new BadRequestError("Request must be multipart/form-data.");
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new BadRequestError("No file uploaded. Use the 'file' field.");
    }

    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let pages: string[];
    try {
      if (ext === "pdf") {
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        try {
          const { text } = await parser.getText({ pageJoiner: PAGE_BREAK });
          pages = text
            .split(PAGE_BREAK)
            .map((p) => p.trim())
            .filter(Boolean);
        } finally {
          await parser.destroy();
        }
      } else if (ext === "docx") {
        pages = chunkByParagraphs(
          (await mammoth.extractRawText({ buffer })).value
        );
      } else if (ext === "txt") {
        pages = chunkByParagraphs(buffer.toString("utf-8"));
      } else {
        throw new BadRequestError(
          "Unsupported file type. Use .pdf, .docx or .txt."
        );
      }
    } catch (err) {
      if (err instanceof BadRequestError) throw err;
      throw new BadRequestError(
        `Failed to parse ${ext?.toUpperCase()} file: it may be corrupted or invalid.`
      );
    }

    const wordCount = pages.reduce(
      (sum, p) => sum + p.split(/\s+/).filter(Boolean).length,
      0
    );

    return NextResponse.json({
      success: true,
      filename,
      totalPages: pages.length,
      wordCount,
      pages,
    });
  } catch (err) {
    if (err instanceof BadRequestError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 }
      );
    }
    console.error("Parse error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error while parsing file." },
      { status: 500 }
    );
  }
}
