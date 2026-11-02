export const runtime = "nodejs";

const LANGUAGE_MAP: Record<string, string> = {
  english: "en",
  spanish: "es",
  french: "fr",
  portuguese: "pt",
  arabic: "ar",
  german: "de",
  chinese: "zh",
  turkish: "tr",
};

// The query string carries the text, so long documents are sent in chunks.
const MAX_CHUNK_LENGTH = 1500;

function splitIntoChunks(text: string) {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const pieces: string[] = [];
    for (let i = 0; i < line.length; i += MAX_CHUNK_LENGTH) {
      pieces.push(line.slice(i, i + MAX_CHUNK_LENGTH));
    }
    if (!pieces.length) pieces.push("");
    for (const piece of pieces) {
      const next = current ? `${current}\n${piece}` : piece;
      if (next.length > MAX_CHUNK_LENGTH && current) {
        chunks.push(current);
        current = piece;
      } else {
        current = next;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translateChunk(text: string, targetLang: string) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Translate request failed (${res.status}).`);
  }
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data[0].map((item: any) => item[0]).join("");
}

export async function POST(request: Request) {
  try {
    const { text, targetLanguage } = await request.json();
    if (typeof text !== "string" || !text.trim()) {
      return Response.json(
        { error: "'text' must be a non-empty string." },
        { status: 400 }
      );
    }

    const targetCode =
      LANGUAGE_MAP[String(targetLanguage ?? "").toLowerCase().trim()] || "en";
    console.log(`[Translate API] Translating to ISO code: ${targetCode}`);

    const translatedChunks: string[] = [];
    for (const chunk of splitIntoChunks(text)) {
      translatedChunks.push(
        chunk.trim() ? await translateChunk(chunk, targetCode) : chunk
      );
    }
    const translatedText = translatedChunks.join("\n");

    return Response.json({ success: true, translatedText });
  } catch (error) {
    console.error("Translate Error:", error);
    const message =
      error instanceof Error && error.message ? error.message : "Translation failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
