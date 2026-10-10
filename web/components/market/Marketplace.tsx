"use client";

/** Marketplace (Marketplace.dc.html): real, Didit-verified creators, with search, use and level filters and a price sort. */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AvatarStack, CardRings, HeroHeadline, HeroLine, InlinePill, Panel, pillClass, Silhouette, silhouetteFor, TagChip } from "@/components/ds";
import { IconArrowUpRight, IconBookmark, IconCamera, IconSearch, VerifiedMark } from "@/components/ds/icons";
import { CATEGORIES } from "@/lib/categories";

export type MarketCreator = {
  address: string;
  priceUnits: string; // USDC units, for sorting
  price: string; // "$2.00"
  region: string;
  liveness: "Passive" | "Full";
  uses: string[]; // category labels
  autoApprove: boolean;
  registeredAt: number;
};

const SAVED = "likeness:saved-creators";

export function Marketplace({ creators, source }: { creators: MarketCreator[]; source: string }) {
  const [q, setQ] = useState("");
  const [use, setUse] = useState<string>("all");
  const [level, setLevel] = useState<"any" | "full">("any");
  const [sort, setSort] = useState<"price" | "newest">("price");
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    try {
      setSaved(JSON.parse(localStorage.getItem(SAVED) ?? "[]"));
    } catch {}
  }, []);
  const toggleSave = (a: string) =>
    setSaved((s) => {
      const next = s.includes(a) ? s.filter((x) => x !== a) : [...s, a];
      try {
        localStorage.setItem(SAVED, JSON.stringify(next));
      } catch {}
      return next;
    });

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return creators
      .filter((c) => use === "all" || c.uses.includes(use))
      .filter((c) => level === "any" || c.liveness === "Full")
      .filter((c) => !needle || [c.address, c.region, ...c.uses].some((x) => x.toLowerCase().includes(needle)))
      .sort((a, b) => (sort === "price" ? Number(BigInt(a.priceUnits) - BigInt(b.priceUnits)) : b.registeredAt - a.registeredAt));
  }, [creators, q, use, level, sort]);

  return (
    <>
      <section className="on-dark mx-auto flex max-w-[1320px] flex-wrap items-stretch gap-10 px-4 pb-[110px] pt-8 text-white sm:px-8 sm:pt-11">
        <HeroHeadline label="Find a face to license with consent">
          <HeroLine>
            Find
            <InlinePill icon={<IconSearch size={30} stroke="#DCF37B" />} />a face
          </HeroLine>
          <HeroLine>
            <AvatarStack seeds={[...creators.slice(0, 3).map((c) => c.address), "silhouette-b", "silhouette-c", "silhouette-d"].slice(0, 3)} size={76} />
            <span>to license</span>
          </HeroLine>
          <span className="flex flex-wrap items-center gap-5">
            <span>with</span>
            <form
              role="search"
              onSubmit={(e) => e.preventDefault()}
              className="flex h-[clamp(64px,7vw,84px)] min-w-0 flex-[1_1_320px] items-center gap-2.5 rounded-[22px] border border-ink-line-2 bg-ink-raised pl-6 pr-3 text-[clamp(16px,1.6vw,20px)] tracking-normal"
            >
              <label htmlFor="creator-search" className="sr-only">
                Search creators by use, region or address
              </label>
              <input
                id="creator-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="consent: search by use, region or address"
                className="h-full min-w-0 flex-1 border-0 bg-transparent font-medium text-white outline-none placeholder:text-grey-dark"
              />
              <button type="submit" aria-label="Search" className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-lime text-ink sm:h-[60px] sm:w-[60px]">
                <IconSearch size={24} />
              </button>
            </form>
          </span>
        </HeroHeadline>

        <Link
          href="/#how"
          className="relative flex min-h-[260px] min-w-0 flex-[1_1_380px] flex-col justify-between overflow-hidden rounded-[30px] bg-lime p-8 text-ink no-underline sm:min-h-[320px]"
        >
          <CardRings />
          <span className="relative flex items-start justify-between">
            <span aria-hidden="true" className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-ink text-white">
              <IconCamera size={28} />
            </span>
            <IconArrowUpRight size={48} />
          </span>
          <span className="relative text-[clamp(34px,4vw,46px)] font-bold leading-[1.05] tracking-[-0.02em]">
            How licensing
            <br />
            works
          </span>
        </Link>
      </section>

      <Panel>
        <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2.5">
          {[{ key: "all", label: "All uses" }, ...CATEGORIES.map((c) => ({ key: c.label, label: c.label }))].map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={use === f.key}
              onClick={() => setUse(f.key)}
              className={`min-h-[46px] rounded-full px-5 text-[15px] font-medium ${use === f.key ? "bg-ink text-white" : "border border-field bg-white text-ink"}`}
            >
              {f.label}
            </button>
          ))}
          <span className="flex-1" />
          <label htmlFor="level" className="text-[14px] text-grey">
            Verification
          </label>
          <select id="level" value={level} onChange={(e) => setLevel(e.target.value as "any" | "full")} className="min-h-[46px] rounded-[14px] border border-field bg-white px-3.5 text-[15px] font-medium">
            <option value="any">Any level</option>
            <option value="full">Full (active liveness)</option>
          </select>
          <label htmlFor="sort" className="text-[14px] text-grey">
            Sort
          </label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as "price" | "newest")} className="min-h-[46px] rounded-[14px] border border-field bg-white px-3.5 text-[15px] font-medium">
            <option value="price">Price, low to high</option>
            <option value="newest">Newest</option>
          </select>
        </div>

        <p className="m-0 text-[14px] text-grey" aria-live="polite">
          {shown.length} of {creators.length} verified creator{creators.length === 1 ? "" : "s"} · from {source}
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((c) => (
            <CreatorCard key={c.address} c={c} saved={saved.includes(c.address)} onSave={() => toggleSave(c.address)} />
          ))}
          {shown.length === 0 && creators.length > 0 && (
            <div className="flex flex-col items-start gap-3 rounded-[26px] border-2 border-dashed border-field bg-white/60 p-6 sm:col-span-2">
              <h2 className="m-0 text-lg font-semibold">No creators match these filters</h2>
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setUse("all");
                  setLevel("any");
                }}
                className={pillClass("outline")}
              >
                Clear filters
              </button>
            </div>
          )}
          {creators.length < 4 && (
            <div className="flex flex-col justify-between gap-4 rounded-[26px] border-2 border-dashed border-field bg-white/60 p-6">
              <div className="space-y-2">
                <h2 className="m-0 text-lg font-semibold">{creators.length === 0 ? "No verified creators yet" : "More faces are on their way"}</h2>
                <p className="m-0 text-[15px] text-grey">Every creator here passed an ID check, a liveness selfie and a face match before they could be listed.</p>
              </div>
              <Link href="/onboard" className={pillClass("ink", "self-start")}>
                Become a creator
              </Link>
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

function CreatorCard({ c, saved, onSave }: { c: MarketCreator; saved: boolean; onSave: () => void }) {
  const s = silhouetteFor(c.address);
  const name = `${c.address.slice(0, 6)}…${c.address.slice(-4)}`;
  return (
    <article className="flex flex-col gap-4 rounded-[26px] bg-white p-[18px]">
      <div className="relative flex aspect-square items-end justify-center overflow-hidden rounded-[18px]" style={{ background: s.tint }}>
        <Silhouette fill={s.sil} />
      </div>
      <div className="flex justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 flex items-center gap-1.5 text-[20px] font-semibold">
            <span className="tnum truncate">{name}</span>
            <VerifiedMark />
          </h2>
          <span className="text-[15px] text-grey">{c.region}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[20px] font-bold">{c.liveness}</span>
          <span className="text-[13px] text-grey">liveness</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3.5">
        <span className="flex flex-wrap gap-1.5">
          {c.uses.map((u) => (
            <TagChip key={u}>{u}</TagChip>
          ))}
        </span>
        <span className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${c.autoApprove ? "bg-ok-bg text-ok" : "bg-wait-bg text-wait"}`}>{c.autoApprove ? "Instant" : "Asks first"}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] text-grey">Price per render</span>
        <span className="tnum text-[28px] font-bold">{c.price}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
          aria-pressed={saved}
          onClick={onSave}
          className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-field bg-white"
        >
          <IconBookmark size={20} filled={saved} />
        </button>
        <Link href={`/market/${c.address}#request`} className="flex min-h-[52px] flex-1 items-center justify-center rounded-2xl bg-lime text-[16px] font-semibold text-ink no-underline hover:bg-lime-deep">
          Request licence
        </Link>
      </div>
    </article>
  );
}
