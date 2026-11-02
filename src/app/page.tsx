"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Languages,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "Portuguese",
  "Arabic",
  "German",
  "Chinese",
  "Turkish",
];

const RTL_LANGUAGES = ["Arabic", "Hebrew", "Persian", "Urdu"];
const isRtlLanguage = (language: string) => RTL_LANGUAGES.includes(language);

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];

const getExtension = (name: string) =>
  name.slice(name.lastIndexOf(".")).toLowerCase();

const STEPS = ["Extracting text...", "Translating document...", "Complete"];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [originalText, setOriginalText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [translatedLanguage, setTranslatedLanguage] = useState("English");
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"original" | "translated" | null>(null);
  const translatedRef = useRef<HTMLDivElement>(null);
  const parseId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const isBusy = isParsing || isTranslating;
  const currentStep = isParsing ? 0 : isTranslating ? 1 : isComplete ? 2 : -1;
  const rtl = isRtlLanguage(translatedLanguage);

  const resetDocument = () => {
    setPages([]);
    setTotalPages(0);
    setCurrentPage(0);
    setProgressPercent(0);
    setIsComplete(false);
    setOriginalText("");
    setTranslatedText("");
  };

  const onDrop = useCallback(async (accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    if (!ALLOWED_EXTENSIONS.includes(getExtension(f.name))) {
      setError("Unsupported file type. Please upload a .pdf, .docx or .txt file.");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError("File is too large. The maximum size is 10MB.");
      return;
    }
    const id = ++parseId.current;
    setFile(f);
    setError("");
    resetDocument();
    setIsParsing(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/parse", { method: "POST", body: form });
      const data = await res.json();
      if (id !== parseId.current) return;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to parse the file.");
      }
      const extracted = data.pages as string[];
      const fullText = extracted.join("\n\n");
      if (!fullText.trim()) {
        throw new Error("No readable text was found in this document.");
      }
      setPages(extracted);
      setTotalPages(extracted.length);
      setOriginalText(fullText);
    } catch (e) {
      if (id !== parseId.current) return;
      setError(e instanceof Error ? e.message : "Failed to parse the file.");
    } finally {
      if (id === parseId.current) setIsParsing(false);
    }
  }, []);

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const codes = rejections[0]?.errors.map((e) => e.code) ?? [];
    if (rejections.length > 1 || codes.includes("too-many-files")) {
      setError("Please upload one file at a time.");
    } else if (codes.includes("file-too-large")) {
      setError("File is too large. The maximum size is 10MB.");
    } else if (codes.includes("file-invalid-type")) {
      setError("Unsupported file type. Please upload a .pdf, .docx or .txt file.");
    } else {
      setError("This file could not be uploaded.");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    multiple: false,
    maxSize: MAX_FILE_SIZE,
    disabled: isBusy,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "text/plain": [".txt"],
    },
  });

  const handleTranslate = async () => {
    if (!pages.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsTranslating(true);
    setIsComplete(false);
    setError("");
    setTranslatedText("");
    setTranslatedLanguage(targetLanguage);
    setProgressPercent(0);

    try {
      for (let i = 0; i < pages.length; i++) {
        if (controller.signal.aborted) return;
        setCurrentPage(i + 1);
        setProgressPercent(Math.round(((i + 1) / totalPages) * 100));

        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: pages[i], targetLanguage }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(
            `Page ${i + 1} failed: ${data.error || "Translation failed."}`
          );
        }
        setTranslatedText((prev) =>
          prev ? `${prev}\n\n${data.translatedText}` : data.translatedText
        );

        if (i < pages.length - 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      setIsComplete(true);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Translation failed.");
    } finally {
      abortRef.current = null;
      setIsTranslating(false);
    }
  };

  const cancelTranslation = () => abortRef.current?.abort();

  const copy = async (which: "original" | "translated", text: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  };

  const download = (text: string, name: string) => {
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    if (!translatedRef.current || !translatedText) return;
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf()
      .set({
        margin: 15,
        filename: `${baseName}-${translatedLanguage.toLowerCase()}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(translatedRef.current)
      .save();
  };

  const baseName = file?.name.replace(/\.[^.]+$/, "") ?? "document";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8 flex items-center gap-3">
          <div className="rounded-xl bg-indigo-600 p-2 text-white">
            <Languages className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold">Document Translator</h1>
        </header>

        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <section className="space-y-5 self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div
              {...getRootProps()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition",
                isDragActive
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
              )}
            >
              <input {...getInputProps()} />
              <UploadCloud className="h-10 w-10 text-indigo-500" />
              <p className="text-sm font-medium">
                {isDragActive
                  ? "Drop the file here"
                  : "Drag & drop or click to upload"}
              </p>
              <p className="text-xs text-slate-500">PDF, DOCX or TXT</p>
            </div>

            {file && (
              <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label="Remove file"
                  disabled={isBusy}
                  className="ml-auto text-slate-500 hover:text-slate-800 disabled:opacity-40"
                  onClick={() => {
                    setError("");
                    setFile(null);
                    resetDocument();
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div>
              <label
                htmlFor="language"
                className="mb-1 block text-sm font-medium"
              >
                Target Language
              </label>
              <select
                id="language"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleTranslate}
              disabled={!file || !pages.length || isBusy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isParsing ? "Extracting..." : "Translating..."}
                </>
              ) : (
                "Translate Document"
              )}
            </button>

            {isTranslating && (
              <div className="space-y-2">
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                  className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
                >
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-sm text-slate-600">
                  {`Translating page ${currentPage} of ${totalPages} (${progressPercent}%)`}
                </p>
                <button
                  type="button"
                  onClick={cancelTranslation}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                >
                  <X className="h-4 w-4" /> Cancel Translation
                </button>
              </div>
            )}

            {currentStep >= 0 && (
              <ol className="space-y-2" aria-live="polite">
                {STEPS.map((label, i) => {
                  const done = i < currentStep || currentStep === 2;
                  const active = i === currentStep && currentStep < 2;
                  return (
                    <li
                      key={label}
                      className={cn(
                        "flex items-center gap-2 text-sm",
                        done
                          ? "text-green-700"
                          : active
                            ? "font-medium text-indigo-700"
                            : "text-slate-400"
                      )}
                    >
                      {done ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : active ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-slate-300" />
                      )}
                      {label}
                    </li>
                  );
                })}
              </ol>
            )}

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <PreviewCard
              title="Original Content"
              hasContent={!!originalText}
              copied={copied === "original"}
              onCopy={() => copy("original", originalText)}
              onDownload={() => download(originalText, `${baseName}-original.txt`)}
              downloadLabel="Download"
            >
              {isParsing ? (
                <Placeholder
                  icon={<Loader2 className="h-10 w-10 animate-spin" />}
                  text="Extracting text..."
                />
              ) : originalText ? (
                <div className="whitespace-pre-wrap">{originalText}</div>
              ) : (
                <Placeholder
                  icon={<FileText className="h-10 w-10" />}
                  text="Upload a document to see its content."
                />
              )}
            </PreviewCard>
            <PreviewCard
              title="Translated Output"
              hasContent={!!translatedText}
              copied={copied === "translated"}
              onCopy={() => copy("translated", translatedText)}
              onDownload={downloadPdf}
              downloadLabel="Download PDF"
            >
              {isTranslating && !translatedText ? (
                <Placeholder
                  icon={<Loader2 className="h-10 w-10 animate-spin" />}
                  text="Translating document..."
                />
              ) : translatedText ? (
                <div
                  ref={translatedRef}
                  dir={rtl ? "rtl" : "ltr"}
                  className={cn(
                    "prose prose-sm prose-slate max-w-none",
                    rtl && "text-right"
                  )}
                >
                  <ReactMarkdown>{translatedText}</ReactMarkdown>
                </div>
              ) : (
                <Placeholder
                  icon={<Sparkles className="h-10 w-10" />}
                  text="Translation will appear here."
                />
              )}
            </PreviewCard>
          </section>
        </div>
      </div>
    </main>
  );
}

function Placeholder({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-300">
      {icon}
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

function PreviewCard({
  title,
  hasContent,
  copied,
  onCopy,
  onDownload,
  downloadLabel,
  children,
}: {
  title: string;
  hasContent: boolean;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
  downloadLabel: string;
  children: ReactNode;
}) {
  const btn =
    "flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex h-[32rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex gap-2">
          <button className={btn} onClick={onCopy} disabled={!hasContent}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy Text"}
          </button>
          <button className={btn} onClick={onDownload} disabled={!hasContent}>
            <Download className="h-3.5 w-3.5" /> {downloadLabel}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-5 text-sm leading-relaxed">
        {children}
      </div>
    </div>
  );
}

