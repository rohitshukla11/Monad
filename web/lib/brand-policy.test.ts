import { describe, expect, it } from "vitest";
import { emailMatchesWebsite, websiteDomain } from "./brand-policy";
import { cleanTags } from "./creator-profile";

describe("brand domain check", () => {
  it("matches a work email to its website, subdomains either way", () => {
    expect(emailMatchesWebsite("ads@levis.com", "https://www.levis.com/en")).toBe(true);
    expect(emailMatchesWebsite("me@marketing.levis.com", "levis.com")).toBe(true);
    expect(emailMatchesWebsite("me@levis.com", "shop.levis.com")).toBe(true);
  });
  it("never verifies a free email domain or a different company", () => {
    expect(emailMatchesWebsite("levis.brand@gmail.com", "levis.com")).toBe(false);
    expect(emailMatchesWebsite("ads@levis.com", "gap.com")).toBe(false);
    expect(emailMatchesWebsite("ads@notlevis.com", "levis.com")).toBe(false);
  });
  it("reads a website's domain", () => {
    expect(websiteDomain("www.levis.com")).toBe("levis.com");
    expect(websiteDomain("not a site")).toBeNull();
  });
});

describe("style tags", () => {
  it("keeps only curated values, never anything sensitive", () => {
    expect(cleanTags({ tone: ["warm", "religion:x"], setting: ["urban", "ethnicity"], ageRange: "30" } as never)).toEqual({ tone: ["warm"], setting: ["urban"], ageRange: null });
  });
});
