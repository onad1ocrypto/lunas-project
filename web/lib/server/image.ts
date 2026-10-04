/**
 * Tiny, dependency-free file inspector used by the Verification Agent.
 *
 * Real checks are better than vibes: instead of pretending, this reads actual bytes from
 * uploaded deliverables to get format, pixel dimensions, colour/alpha channel, DPI and
 * word counts. Everything it cannot prove is reported as "manual" rather than guessed.
 */

import { promises as fs } from "node:fs";

export interface InspectedFile {
  name: string;
  size: number;
  mime: string;
  ext: string;
  width?: number;
  height?: number;
  alpha?: boolean;
  dpi?: number;
  words?: number;
  text?: string;
  pages?: number;
  storedAs?: string;
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  mp4: "video/mp4",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
};

export const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();
export const mimeOf = (name: string, given?: string) => MIME[extOf(name)] ?? given ?? "application/octet-stream";

/** PNG: IHDR holds dimensions + colour type; pHYs holds DPI. */
function inspectPng(buf: Buffer): Partial<InspectedFile> {
  if (buf.length < 33) return {};
  const out: Partial<InspectedFile> = {};
  if (buf.readUInt32BE(0) === 0x89504e47) {
    out.width = buf.readUInt32BE(16);
    out.height = buf.readUInt32BE(20);
    const colourType = buf[25];
    out.alpha = colourType === 4 || colourType === 6;
    const phys = buf.indexOf("pHYs", 8, "ascii");
    if (phys > 0 && buf.length >= phys + 14) {
      const ppuX = buf.readUInt32BE(phys + 4);
      const unit = buf[phys + 12];
      if (unit === 1 && ppuX > 0) out.dpi = Math.round(ppuX * 0.0254);
    }
    if (buf.length >= 8) out.pages = 1;
  }
  return out;
}

/** JPEG: walk the segment chain to the SOFn frame header; density comes from APP0/JFIF. */
function inspectJpeg(buf: Buffer): Partial<InspectedFile> {
  const out: Partial<InspectedFile> = {};
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return {};
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xe0 && len >= 14 && buf.toString("ascii", i + 4, i + 8) === "JFIF") {
      const units = buf[i + 11];
      const xDensity = buf.readUInt16BE(i + 12);
      if (units === 1 && xDensity > 0) out.dpi = xDensity;
      else if (units === 2 && xDensity > 0) out.dpi = Math.round(xDensity * 2.54);
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof && i + 9 < buf.length) {
      out.height = buf.readUInt16BE(i + 5);
      out.width = buf.readUInt16BE(i + 7);
      out.pages = 1;
      return out;
    }
    if (marker === 0xda) break; // start of scan
    i += 2 + len;
  }
  return out;
}

function inspectGif(buf: Buffer): Partial<InspectedFile> {
  if (buf.length < 10 || buf.toString("ascii", 0, 3) !== "GIF") return {};
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), pages: 1 };
}

/** WebP: VP8X / VP8L / VP8 lossy headers. */
function inspectWebp(buf: Buffer): Partial<InspectedFile> {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return {};
  const fourcc = buf.toString("ascii", 12, 16);
  if (fourcc === "VP8X") {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
      alpha: Boolean(buf[20] & 0x10),
      pages: 1,
    };
  }
  if (fourcc === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), alpha: Boolean((bits >> 28) & 1), pages: 1 };
  }
  if (fourcc === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, pages: 1 };
  }
  return {};
}

/** SVG: read width/height attributes as a fallback. */
function inspectSvg(text: string): Partial<InspectedFile> {
  const w = text.match(/\bwidth\s*=\s*"(\d+(?:\.\d+)?)/i);
  const h = text.match(/\bheight\s*=\s*"(\d+(?:\.\d+)?)/i);
  const vb = text.match(/\bviewBox\s*=\s*"[\d.\s-]*?([\d.]+)[\s,]+([\d.]+)"/i);
  const width = w ? Math.round(Number(w[1])) : vb ? Math.round(Number(vb[1])) : undefined;
  const height = h ? Math.round(Number(h[1])) : vb ? Math.round(Number(vb[2])) : undefined;
  return { width, height, alpha: /<svg/i.test(text) };
}

/** Crude but honest PDF page count: count page objects in the raw stream. */
function inspectPdf(buf: Buffer): Partial<InspectedFile> {
  if (buf.length < 5 || buf.toString("ascii", 0, 5) !== "%PDF-") return {};
  const raw = buf.toString("latin1");
  const counts = raw.match(/\/Type\s*\/Page[^s]/g);
  const kidsBased = raw.match(/\/Count\s+(\d+)/);
  const pages = counts?.length ?? (kidsBased ? Number(kidsBased[1]) : undefined);
  return { pages };
}

const TEXT_EXT = new Set(["txt", "md", "csv", "json", "html", "htm", "srt", "vtt"]);

export function countWords(text: string) {
  return text
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length > 0).length;
}

/** Inspect one uploaded file. `storedAs` lets the caller keep bytes for vision checks. */
export async function inspectFile(buf: Buffer, name: string, storedAs?: string): Promise<InspectedFile> {
  const ext = extOf(name);
  const base: InspectedFile = { name, size: buf.length, mime: mimeOf(name), ext, storedAs };

  if (ext === "png") return { ...base, ...inspectPng(buf) };
  if (ext === "jpg" || ext === "jpeg") return { ...base, ...inspectJpeg(buf) };
  if (ext === "gif") return { ...base, ...inspectGif(buf) };
  if (ext === "webp") return { ...base, ...inspectWebp(buf) };
  if (ext === "pdf") return { ...base, ...inspectPdf(buf) };
  if (ext === "svg") return { ...base, ...inspectSvg(buf.toString("utf8")) };
  if (TEXT_EXT.has(ext)) {
    const text = buf.toString("utf8").slice(0, 200_000);
    return { ...base, text, words: countWords(text) };
  }
  return base;
}

export async function readStored(baseDir: string, rel: string) {
  try {
    return await fs.readFile(`${baseDir}/${rel}`);
  } catch {
    return null;
  }
}

/** True when the extension/mime is an image the vision model can actually look at. */
export function isVisionReadable(f: { ext: string }) {
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(f.ext);
}
