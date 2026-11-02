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

// The text travels in the query string, so long input is sent in pieces.
const MAX_PIECE_LENGTH = 1500;

function splitIntoPieces(text: string) {
  const pieces: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    for (let i = 0; i === 0 || i < line.length; i += MAX_PIECE_LENGTH) {
      const part = line.slice(i, i + MAX_PIECE_LENGTH);
      const next = current ? `${current}\n${part}` : part;
      if (next.length > MAX_PIECE_LENGTH && current) {
        pieces.push(current);
        current = part;
      } else {
        current = next;
      }
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

async function translatePiece(text: string, targetCode: string) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetCode}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Translate request failed (${res.status}).`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Unexpected response from the translation service.");
  }
  return (data[0] as unknown[][])
    .map((item) => (typeof item?.[0] === "string" ? item[0] : ""))
    .join("");
}

export async function translateChunkClient(
  text: string,
  targetLanguage: string
): Promise<string> {
  const targetCode =
    LANGUAGE_MAP[targetLanguage.toLowerCase().trim()] || "en";
  const out: string[] = [];
  for (const piece of splitIntoPieces(text)) {
    out.push(piece.trim() ? await translatePiece(piece, targetCode) : piece);
  }
  return out.join("\n");
}
