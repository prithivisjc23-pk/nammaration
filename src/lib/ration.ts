// Pure business rules for Namma Ration (ported from the original single-file app).

export type Lang = "en" | "ta";
export type CrowdLevel = "low" | "medium" | "heavy";
export type SmsType = "morning" | "evening";
export type ShopStatus = "open" | "lunch" | "closed";
export const SHOP_STATUSES: ShopStatus[] = ["open", "lunch", "closed"];
export type StockKey = "rice" | "sugar" | "oil" | "dal" | "wheat" | "kerosene";
export type StockState = Record<StockKey, boolean>;

export const DISTRICTS = [
  "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode",
  "Kallakurichi", "Kancheepuram", "Kanniyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai",
  "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem",
  "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupathur",
  "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar",
] as const;

export const STOCK_ITEMS: { key: StockKey; en: string; ta: string; icon: string }[] = [
  { key: "rice", en: "Rice", ta: "அரிசி", icon: "🍚" },
  { key: "sugar", en: "Sugar", ta: "சர்க்கரை", icon: "🧂" },
  { key: "oil", en: "Oil", ta: "எண்ணெய்", icon: "🫙" },
  { key: "dal", en: "Paruppu (Toor Dal)", ta: "பருப்பு", icon: "🫘" },
  { key: "wheat", en: "Wheat", ta: "கோதுமை", icon: "🌾" },
  { key: "kerosene", en: "Kerosene", ta: "மண்ணெண்ணெய்", icon: "🛢️" },
];

export const DEFAULT_STOCK: StockState = { rice: true, sugar: true, oil: true, dal: true, wheat: false, kerosene: false };

export const CROWD: Record<CrowdLevel, { en: string; ta: string }> = {
  low: { en: "Low", ta: "குறைவு" },
  medium: { en: "Medium", ta: "மிதமான" },
  heavy: { en: "Heavy", ta: "அதிகம்" },
};

export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const monthLabel = (key: string, lang: Lang) => {
  const [y = 1970, m = 1] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", {
    month: "long",
    year: "numeric",
  });
};

export const normCard = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const normalizeShopNumber = (s: string) =>
  s.trim().replace(/^shop\s*#?\s*/i, "").replace(/^#/, "").toUpperCase();

export const isValidShopNumber = (s: string) => /^[A-Z0-9-]{1,12}$/.test(s);

export const isValidUsername = (s: string) => /^[A-Za-z0-9._-]{3,30}$/.test(s);

export const normalizeCard = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

export const isValidCard = (card: string) =>
  /^[A-Z0-9][A-Z0-9/-]{5,19}$/.test(card) && normCard(card).length >= 6;

export const normalizeMobile = (s: string) => s.replace(/\D/g, "");

export const isValidMobile = (mobile: string) => /^[6-9]\d{9}$/.test(mobile);

/** Morning alerts need the shop OPEN; evening alerts need the shop CLOSED. Lunch break locks both. */
export const isSmsLocked = (type: SmsType, status: ShopStatus) =>
  type === "morning" ? status !== "open" : status !== "closed";

export const parseStatus = (s: string): ShopStatus => (s === "lunch" || s === "closed" ? s : "open");

/** Synthetic sign-in address for cardholders, who log in with their Smart Card number. */
/** Internal sign-in address for a shop; shopkeepers never see or type it. */
export const shopkeeperEmail = (shopNumber: string) =>
  `shop-${normalizeShopNumber(shopNumber).toLowerCase()}@shop.nammaration.app`;

export const cardholderEmail = (card: string) => `card-${normCard(card).toLowerCase()}@cardholder.nammaration.app`;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export type ShopTimings = { morningOpen: string; morningClose: string; eveningOpen: string; eveningClose: string };

/** Times are HH:MM (24h) and must run in order: morning open < close <= evening open < close. */
export function isValidTimings(t: ShopTimings) {
  const all = [t.morningOpen, t.morningClose, t.eveningOpen, t.eveningClose];
  if (!all.every((x) => TIME_RE.test(x))) return false;
  const [a, b, c, d] = all.map(toMinutes) as [number, number, number, number];
  return a < b && b <= c && c < d;
}

export function formatTime(hhmm: string, lang: Lang) {
  if (!TIME_RE.test(hhmm)) return hhmm;
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const pm = h >= 12;
  const suffix = lang === "ta" ? (pm ? "மாலை" : "காலை") : pm ? "PM" : "AM";
  return `${String(h12).padStart(2, "0")}:${m} ${suffix}`;
}

export type CustomerLike = { status: string; card: string; mobile: string; name: string };

export const countCustomers = (customers: CustomerLike[]) => {
  const total = customers.length;
  const collected = customers.filter((c) => c.status === "collected").length;
  return { total, collected, pending: total - collected };
};

export function searchCustomers<T extends CustomerLike>(customers: T[], query: string, limit = 20): T[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const qCard = normCard(q);
  const qDigits = q.replace(/\D/g, "");
  return customers
    .filter(
      (c) => (qCard && normCard(c.card).includes(qCard)) || (qDigits.length >= 2 && c.mobile.includes(qDigits)),
    )
    .slice(0, limit);
}

export function sortRegistry<T extends CustomerLike>(customers: T[]): T[] {
  return [...customers].sort((a, b) =>
    a.status === b.status ? a.name.localeCompare(b.name) : a.status === "collected" ? 1 : -1,
  );
}

export function buildSmsMessage(
  type: SmsType,
  shop: { shopNumber: string; status: ShopStatus; crowd: CrowdLevel; stock: StockState },
) {
  const avail = STOCK_ITEMS.filter((s) => shop.stock[s.key]);
  const availEn = avail.map((s) => s.en).join(", ") || "None";
  const availTa = avail.map((s) => s.ta).join(", ") || "இல்லை";
  const id = shop.shopNumber;
  if (type === "morning") {
    return shop.status === "open"
      ? `நம்ம ரேஷன் | கடை #${id}: இன்று கடை திறந்துள்ளது. கிடைப்பவை: ${availTa}. கூட்டம்: ${CROWD[shop.crowd].ta}. உங்கள் பொருட்களை வாங்கவும்.\n\nNamma Ration | Shop #${id}: Shop is OPEN today. Available: ${availEn}. Crowd: ${CROWD[shop.crowd].en}. Please collect your ration.`
      : `நம்ம ரேஷன் | கடை #${id}: இன்று கடை மூடப்பட்டுள்ளது. தயவுசெய்து அடுத்த வேலை நாளில் வரவும்.\n\nNamma Ration | Shop #${id}: Shop is CLOSED today. Please visit on the next working day.`;
  }
  return `நம்ம ரேஷன் | கடை #${id}: இன்றைய விநியோகம் முடிந்தது. நீங்கள் இன்னும் பொருட்கள் வாங்கவில்லை — நாளை வரவும்.\n\nNamma Ration | Shop #${id}: Today's distribution has closed. You have not collected your ration yet — please visit tomorrow.`;
}

export function parseStock(value: unknown): StockState {
  const v = (value && typeof value === "object" ? value : {}) as Partial<Record<StockKey, unknown>>;
  return STOCK_ITEMS.reduce((acc, s) => {
    acc[s.key] = typeof v[s.key] === "boolean" ? (v[s.key] as boolean) : DEFAULT_STOCK[s.key];
    return acc;
  }, {} as StockState);
}
