// Mock data for the UI stage. Will be replaced by the real DB + PayPal sandbox later.

export type Direction = "from_client" | "to_client";
export type Status =
  | "request"          // client asked for work, freelancer hasn't accepted yet
  | "awaiting_payment" // contract agreed, waiting for client to fund via PayPal
  | "in_escrow"        // funded, freelancer working
  | "verifying"        // delivery uploaded, AI checking
  | "revision"         // AI found an unmet criterion
  | "review"           // all criteria passed, client review window running
  | "paid"             // released — LUNAS!
  | "declined";

export type CriterionIcon = "file" | "image" | "ruler" | "palette" | "clock" | "text";
export interface Criterion { label: string; rule: string; icon: CriterionIcon }

export interface Person {
  name: string;
  handle?: string;
  initials: string;
  city: string;
  country: string; // ISO code shown as a pill
  color: string;   // CSS var name for avatar bg
}

export interface Order {
  id: string;
  direction: Direction;
  title: string;
  client: Person;
  amount: number;
  currency: string;
  due: string;      // ISO date
  created: string;  // ISO date
  status: Status;
  brief: string;
  criteria: Criterion[];
  accent: string;   // card accent color var
  product: ProductKind; // icon used on cards
}

export type ProductKind = "bottle" | "mug" | "shoe" | "bag" | "candle" | "watch" | "plant" | "cap";

export const ME: Person = { name: "SASAM", handle: "sasam", initials: "S", city: "", country: "ID", color: "var(--peach-l)" };

export const ORDERS: Order[] = [
  {
    id: "LNS-0142",
    direction: "from_client",
    title: "Product photo editing · 20 photos",
    client: { name: "James Miller", initials: "JM", city: "Austin", country: "US", color: "var(--sky-l)" },
    amount: 150, currency: "USD", due: "2026-11-06", created: "2026-10-28",
    status: "in_escrow",
    brief: "Hi Sari! I need my 20 product photos edited for my online store. Clean white background, at least 2000px, JPG. Can you deliver by Friday? Budget is $150.",
    criteria: [
      { label: "Exactly 20 files", rule: "count(files) == 20", icon: "file" },
      { label: "JPG format", rule: "mime == image/jpeg", icon: "image" },
      { label: "Min. 2000px long edge", rule: "max(w,h) ≥ 2000", icon: "ruler" },
      { label: "Pure white background", rule: "vision: bg ≥ 97% #FFF", icon: "palette" },
    ],
    accent: "var(--sky)", product: "watch",
  },
  {
    id: "LNS-0147",
    direction: "from_client",
    title: "Logo refresh for a bakery",
    client: { name: "Mei Lin", initials: "ML", city: "Singapore", country: "SG", color: "var(--pink-l)" },
    amount: 320, currency: "USD", due: "2026-11-14", created: "2026-11-01",
    status: "request",
    brief: "Hello! We run a small bakery called Mei's Oven. Looking for a refreshed logo: 3 concepts, vector files (SVG + PNG), pastel colors, done in two weeks. Budget around $320.",
    criteria: [
      { label: "3 logo concepts", rule: "count(concepts) == 3", icon: "file" },
      { label: "SVG + PNG for each", rule: "formats ⊇ {svg, png}", icon: "image" },
      { label: "Pastel palette", rule: "vision: avg saturation < 45%", icon: "palette" },
      { label: "Delivered by 14 Nov", rule: "submitted_at ≤ due", icon: "clock" },
    ],
    accent: "var(--pink)", product: "candle",
  },
  {
    id: "LNS-0139",
    direction: "to_client",
    title: "Instagram carousel · 6 slides",
    client: { name: "Lukas Weber", initials: "LW", city: "Berlin", country: "DE", color: "var(--lemon-l)" },
    amount: 90, currency: "USD", due: "2026-11-03", created: "2026-10-25",
    status: "review",
    brief: "6-slide Instagram carousel for a coffee subscription launch. 1080×1350px, brand colors, PNG.",
    criteria: [
      { label: "6 slides", rule: "count(files) == 6", icon: "file" },
      { label: "1080 × 1350 px", rule: "w == 1080 && h == 1350", icon: "ruler" },
      { label: "PNG format", rule: "mime == image/png", icon: "image" },
    ],
    accent: "var(--lemon)", product: "mug",
  },
  {
    id: "LNS-0151",
    direction: "to_client",
    title: "Website copy · 4 pages",
    client: { name: "Aiko Tanaka", initials: "AT", city: "Osaka", country: "JP", color: "var(--lav-l)" },
    amount: 240, currency: "USD", due: "2026-11-20", created: "2026-11-02",
    status: "awaiting_payment",
    brief: "Write English copy for 4 pages (Home, About, Services, Contact) for a ceramics studio. 300–500 words each, friendly tone, include keywords 'handmade' and 'Osaka'.",
    criteria: [
      { label: "4 pages delivered", rule: "count(docs) == 4", icon: "file" },
      { label: "300–500 words each", rule: "300 ≤ words ≤ 500", icon: "text" },
      { label: "Keywords included", rule: "contains('handmade','Osaka')", icon: "text" },
    ],
    accent: "var(--lav)", product: "plant",
  },
  {
    id: "LNS-0133",
    direction: "from_client",
    title: "Etsy banner + shop icon",
    client: { name: "Olivia Brown", initials: "OB", city: "London", country: "GB", color: "var(--mint-l)" },
    amount: 75, currency: "USD", due: "2026-10-22", created: "2026-10-15",
    status: "paid",
    brief: "Shop banner 3360×840 and a 500×500 shop icon. Earthy colors.",
    criteria: [
      { label: "Banner 3360 × 840", rule: "w == 3360 && h == 840", icon: "ruler" },
      { label: "Icon 500 × 500", rule: "w == h == 500", icon: "ruler" },
    ],
    accent: "var(--mint)", product: "bag",
  },
  {
    id: "LNS-0145",
    direction: "to_client",
    title: "Menu design · café",
    client: { name: "Carlos Ruiz", initials: "CR", city: "Madrid", country: "ES", color: "var(--peach-l)" },
    amount: 180, currency: "USD", due: "2026-11-09", created: "2026-10-30",
    status: "revision",
    brief: "Two-page A4 menu, print-ready PDF with 3mm bleed, Spanish + English.",
    criteria: [
      { label: "2 pages, A4", rule: "pages == 2 && size == A4", icon: "file" },
      { label: "3mm bleed", rule: "pdf.bleed == 3mm", icon: "ruler" },
      { label: "Bilingual ES + EN", rule: "lang ⊇ {es, en}", icon: "text" },
    ],
    accent: "var(--peach)", product: "cap",
  },
  {
    id: "LNS-0129",
    direction: "to_client",
    title: "Pitch deck polish · 12 slides",
    client: { name: "Noah Kim", initials: "NK", city: "Seoul", country: "KR", color: "var(--sky-l)" },
    amount: 210, currency: "USD", due: "2026-10-18", created: "2026-10-08",
    status: "paid",
    brief: "Polish a 12-slide pitch deck. Consistent fonts, icons, export to PDF + PPTX.",
    criteria: [
      { label: "12 slides", rule: "count(slides) == 12", icon: "file" },
      { label: "PDF + PPTX", rule: "formats ⊇ {pdf, pptx}", icon: "image" },
    ],
    accent: "var(--sky)", product: "shoe",
  },
  {
    id: "LNS-0150",
    direction: "from_client",
    title: "Children's book spot illustrations",
    client: { name: "Emma Rossi", initials: "ER", city: "Milan", country: "IT", color: "var(--lemon-l)" },
    amount: 400, currency: "USD", due: "2026-11-28", created: "2026-11-02",
    status: "request",
    brief: "8 spot illustrations for a picture book about a sleepy cat. Watercolor style, 300 DPI, transparent PNG.",
    criteria: [
      { label: "8 illustrations", rule: "count(files) == 8", icon: "file" },
      { label: "300 DPI", rule: "dpi ≥ 300", icon: "ruler" },
      { label: "Transparent PNG", rule: "png && alpha", icon: "image" },
    ],
    accent: "var(--lemon)", product: "bottle",
  },
];

export const getOrder = (id: string) => ORDERS.find((o) => o.id === id);

export const STATUS_STYLE: Record<Status, { bg: string; fg: string }> = {
  request: { bg: "var(--pink-l)", fg: "#C2185B" },
  awaiting_payment: { bg: "var(--lemon-l)", fg: "#9A6B00" },
  in_escrow: { bg: "var(--sky-l)", fg: "#1F5FBF" },
  verifying: { bg: "var(--lav-l)", fg: "#5B3CC4" },
  revision: { bg: "var(--peach-l)", fg: "#C2551B" },
  review: { bg: "var(--lav-l)", fg: "#5B3CC4" },
  paid: { bg: "var(--mint-l)", fg: "#0E7A4D" },
  declined: { bg: "#EEE", fg: "#666" },
};

/** Which statuses need the freelancer to do something */
export const NEEDS_ME: Status[] = ["request", "in_escrow", "revision"];

/* ------------------------------------------------------------------
   "Fake AI" brief parser used in the UI stage so the demo reacts
   to what the user types. Replaced by the real Contract Agent later.
   ------------------------------------------------------------------ */
type L = "en" | "zh" | "id";
const TPL: Record<L, Record<string, (...a: string[]) => string>> = {
  en: { count: (n, u) => `Exactly ${n} ${u}`, fmt: (f) => `${f} format`, size: (w, h) => `${w} × ${h} px`, min: (p) => `Min. ${p}px long edge`,
        white: () => "Pure white background", palette: () => "Color palette as described", words: (a, b) => `${a}–${b} words`, by: (d) => `Delivered by ${d}`, match: () => "Matches the brief" },
  zh: { count: (n, u) => `数量：${n} ${u}`, fmt: (f) => `${f} 格式`, size: (w, h) => `尺寸 ${w} × ${h} px`, min: (p) => `长边至少 ${p}px`,
        white: () => "纯白背景", palette: () => "配色符合描述", words: (a, b) => `${a}–${b} 字`, by: (d) => `${d}前交付`, match: () => "符合需求描述" },
  id: { count: (n, u) => `Tepat ${n} ${u}`, fmt: (f) => `Format ${f}`, size: (w, h) => `Ukuran ${w} × ${h} px`, min: (p) => `Sisi panjang min. ${p}px`,
        white: () => "Latar putih bersih", palette: () => "Warna sesuai deskripsi", words: (a, b) => `${a}–${b} kata`, by: (d) => `Dikirim sebelum ${d}`, match: () => "Sesuai brief" },
};

export function draftCriteria(brief: string, lang: L = "en"): { criteria: Criterion[]; amount?: number; title: string } {
  const T = TPL[lang];
  const b = brief.toLowerCase();
  const out: Criterion[] = [];
  const count = b.match(/(\d+)\s*(?:[a-z]+\s+)?(photos?|images?|files?|slides?|pages?|illustrations?|concepts?|logos?|videos?|foto|gambar|halaman|ilustrasi|konsep|张|个|页)(?![a-z])/);
  if (count) out.push({ label: T.count(count[1], count[2]), rule: `count(files) == ${count[1]}`, icon: "file" });
  const fmt = b.match(/\b(jpg|jpeg|png|svg|pdf|pptx|mp4|docx)\b/g);
  if (fmt) out.push({ label: T.fmt([...new Set(fmt)].map((f) => f.toUpperCase()).join(" + ")), rule: `mime ∈ {${[...new Set(fmt)].join(", ")}}`, icon: "image" });
  const px = b.match(/(\d{3,4})\s*(?:x|×)\s*(\d{3,4})/) ;
  const minpx = b.match(/(?:at least|min(?:imum|imal)?\.?|至少)\s*(\d{3,4})\s*px/) || b.match(/(\d{3,4})\s*px/);
  if (px) out.push({ label: T.size(px[1], px[2]), rule: `w == ${px[1]} && h == ${px[2]}`, icon: "ruler" });
  else if (minpx) out.push({ label: T.min(minpx[1]), rule: `max(w,h) ≥ ${minpx[1]}`, icon: "ruler" });
  if (/white background|white bg|latar putih|白底|纯白背景|白色背景/.test(b)) out.push({ label: T.white(), rule: "vision: bg ≥ 97% #FFF", icon: "palette" });
  else if (/pastel|brand colou?rs|earthy|colou?rs?|warna brand|warna|品牌色|配色/.test(b)) out.push({ label: T.palette(), rule: "vision: palette match", icon: "palette" });
  const words = b.match(/(\d{2,4})\s*[–-]\s*(\d{2,4})\s*words/);
  if (words) out.push({ label: T.words(words[1], words[2]), rule: `${words[1]} ≤ words ≤ ${words[2]}`, icon: "text" });
  const day = b.match(/(?:by|sebelum)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|senin|selasa|rabu|kamis|jumat|sabtu|minggu|\d{1,2}\s+\w+)/) || b.match(/(周[一二三四五六日])前/);
  if (day) out.push({ label: T.by(day[1][0].toUpperCase() + day[1].slice(1)), rule: "submitted_at ≤ due", icon: "clock" });
  if (out.length < 2) out.push({ label: T.match(), rule: "vision + LLM review", icon: "text" });
  const money = brief.match(/\$\s?(\d+(?:\.\d+)?)/) || brief.match(/(\d+(?:\.\d+)?)\s?(?:usd|dollars)/i);
  const title = (brief.split(/[.!?:,！？。：，]/).find((s) => s.trim().length > 12 || /[\u4e00-\u9fff]{6,}/.test(s))?.trim() ?? "New order").replace(/^(hi|hello|hey|halo|hai|你好)\s*\w*\s*/i, "");
  const shortTitle = title.length > 56 ? title.slice(0, 56).replace(/\s+\S*$/, "") + "…" : title;
  return { criteria: out.slice(0, 5), amount: money ? parseFloat(money[1]) : undefined, title: shortTitle };
}
