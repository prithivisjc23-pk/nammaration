import { describe, expect, it } from "vitest";
import {
  buildSmsMessage,
  cardholderEmail,
  formatTime,
  isValidTimings,
  countCustomers,
  isSmsLocked,
  isValidCard,
  isValidMobile,
  isValidShopNumber,
  normalizeShopNumber,
  searchCustomers,
  sortRegistry,
  DEFAULT_STOCK,
} from "./ration";

const c = (name: string, card: string, mobile: string, status = "pending") => ({ name, card, mobile, status });

describe("SMS lock rules", () => {
  it("allows the morning alert only while the shop is open", () => {
    expect(isSmsLocked("morning", "open")).toBe(false);
    expect(isSmsLocked("morning", "closed")).toBe(true);
  });
  it("allows the evening alert only while the shop is closed", () => {
    expect(isSmsLocked("evening", "closed")).toBe(false);
    expect(isSmsLocked("evening", "open")).toBe(true);
  });
  it("locks both alerts during lunch break", () => {
    expect(isSmsLocked("morning", "lunch")).toBe(true);
    expect(isSmsLocked("evening", "lunch")).toBe(true);
  });
});

describe("shop timings", () => {
  it("accepts the default 08:30-12:00 / 15:00-18:00 schedule", () => {
    expect(isValidTimings({ morningOpen: "08:30", morningClose: "12:00", eveningOpen: "15:00", eveningClose: "18:00" })).toBe(true);
  });
  it("rejects evening hours that start before the morning ends", () => {
    expect(isValidTimings({ morningOpen: "08:30", morningClose: "12:00", eveningOpen: "11:00", eveningClose: "18:00" })).toBe(false);
  });
  it("shows times as 12-hour clock", () => {
    expect(formatTime("08:30", "en")).toBe("08:30 AM");
    expect(formatTime("15:00", "en")).toBe("03:00 PM");
  });
});

describe("cardholder sign-in", () => {
  it("derives the same sign-in address from any spelling of the card number", () => {
    expect(cardholderEmail("33/g/0123456")).toBe(cardholderEmail("33G 0123456"));
  });
});

describe("customer validation", () => {
  it("accepts a smart card like 33/G/0123456 and rejects short ones", () => {
    expect(isValidCard("33/G/0123456")).toBe(true);
    expect(isValidCard("33/G")).toBe(false);
  });
  it("requires a 10-digit mobile starting with 6-9", () => {
    expect(isValidMobile("9876543210")).toBe(true);
    expect(isValidMobile("5876543210")).toBe(false);
    expect(isValidMobile("987654321")).toBe(false);
  });
});

describe("shop number", () => {
  it("strips a 'Shop #' prefix and uppercases", () => {
    expect(normalizeShopNumber("shop #12ab")).toBe("12AB");
  });
  it("allows up to 12 letters, digits or dashes", () => {
    expect(isValidShopNumber("TN-1234")).toBe(true);
    expect(isValidShopNumber("ABCDEFGHIJKLM")).toBe(false);
  });
});

describe("counters and search", () => {
  const list = [
    c("Ravi", "33/G/0000001", "9876500001"),
    c("Anbu", "33/G/0000002", "9876500002", "collected"),
  ];
  it("counts pending as total minus collected", () => {
    expect(countCustomers(list)).toEqual({ total: 2, collected: 1, pending: 1 });
  });
  it("needs at least 2 characters and matches card or mobile", () => {
    expect(searchCustomers(list, "0")).toEqual([]);
    expect(searchCustomers(list, "0000002").map((x) => x.name)).toEqual(["Anbu"]);
    expect(searchCustomers(list, "500001").map((x) => x.name)).toEqual(["Ravi"]);
  });
  it("lists pending customers before collected ones", () => {
    expect(sortRegistry([...list].reverse()).map((x) => x.name)).toEqual(["Ravi", "Anbu"]);
  });
});

describe("SMS message", () => {
  it("morning open message lists only available stock", () => {
    const msg = buildSmsMessage("morning", { shopNumber: "1234", status: "open", crowd: "low", stock: DEFAULT_STOCK });
    expect(msg).toContain("Shop #1234: Shop is OPEN today. Available: Rice, Sugar, Oil. Crowd: Low.");
  });
});
