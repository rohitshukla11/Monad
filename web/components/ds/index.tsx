/**
 * Shared design-system components. Tokens live in app/globals.css; these compose them.
 * Server-safe unless noted (Reveal and the motion hooks are client components, in ./motion).
 */
import Link from "next/link";
import type { ReactNode } from "react";

// ---------------------------------------------------------------- silhouettes (no real faces)

export const SILHOUETTES = [
  { tint: "#E3E6EC", sil: "#7D838F" },
  { tint: "#F4C9D6", sil: "#C27A92" },
  { tint: "#F6D9A8", sil: "#C08A3E" },
  { tint: "#DCE8D2", sil: "#6F8E5A" },
] as const;

/** A stable silhouette palette per address, so a creator always gets the same neutral illustration. */
export function silhouetteFor(seed: string) {
  let h = 0;
  for (const c of seed.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SILHOUETTES[h % SILHOUETTES.length];
}

export function Silhouette({ fill, width = "78%", height = "92%" }: { fill: string; width?: string | number; height?: string | number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 140" width={width} height={height}>
      <circle cx="60" cy="52" r="26" fill={fill} />
      <path d="M14 140c4-34 22-52 46-52s42 18 46 52z" fill={fill} />
    </svg>
  );
}

export function Avatar({ seed, size = 52, ring }: { seed: string; size?: number; ring?: string }) {
  const s = silhouetteFor(seed);
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-end justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: s.tint, border: ring ? `3px solid ${ring}` : undefined }}
    >
      <Silhouette fill={s.sil} width={size * 0.88} height={size} />
    </span>
  );
}

export function Initial({ name, size = 52, dark = true }: { name: string; size?: number; dark?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full text-lg font-bold ${dark ? "bg-ink text-lime" : "bg-[#E3E6EC] text-grey"}`}
      style={{ width: size, height: size }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------- buttons and links (44px+ targets)

type Kind = "lime" | "ink" | "outline" | "outline-dark" | "coral" | "danger" | "ghost" | "white";
const kinds: Record<Kind, string> = {
  lime: "bg-lime text-ink hover:bg-lime-deep",
  ink: "bg-ink text-white hover:bg-[#2b2d33]",
  outline: "border border-field bg-white text-ink hover:border-grey",
  "outline-dark": "border-2 border-ink bg-transparent text-ink hover:bg-ink/5",
  coral: "bg-red text-ink hover:brightness-95",
  danger: "border border-[#E8B4B4] bg-white text-bad hover:bg-bad-bg",
  ghost: "text-grey hover:text-ink",
  white: "bg-white text-ink hover:bg-paper",
};

export function pillClass(kind: Kind = "lime", extra = "") {
  return `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${kinds[kind]} ${extra}`;
}

export function PillButton({
  kind = "lime",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind }) {
  return <button type="button" {...rest} className={pillClass(kind, className)} />;
}

export function PillLink({ kind = "lime", className = "", href, children, ...rest }: { kind?: Kind; className?: string; href: string; children: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} {...rest} className={pillClass(kind, className)}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- pills and chips

export type PillKind = "licensed" | "revoked" | "waiting" | "neutral" | "lime";
const pills: Record<PillKind, string> = {
  licensed: "bg-ok-bg text-ok",
  revoked: "bg-bad-bg text-bad",
  waiting: "bg-wait-bg text-wait",
  neutral: "bg-[#ECEEE8] text-grey",
  lime: "bg-ink text-lime",
};

export function StatusPill({ kind, children, title }: { kind: PillKind; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold ${pills[kind]}`}>
      {children}
    </span>
  );
}

export function TagChip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-field px-3 py-1.5 text-[13px] font-medium text-ink">{children}</span>;
}

// ---------------------------------------------------------------- page structure

/** The dark top of an app page. Children are usually a HeroHeadline and, optionally, a hero card. */
export function PageHero({ children }: { children: ReactNode }) {
  return (
    <section className="on-dark mx-auto flex max-w-[1320px] flex-wrap items-stretch gap-10 px-4 pb-[84px] pt-7 text-white sm:px-8 sm:pt-9">
      {children}
    </section>
  );
}

/** Big multi-line app headline (Poppins 700). Lines are separate elements; pass pills and stacks inline. */
export function HeroHeadline({ children, label, className = "flex-[999_1_640px]" }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <h1 aria-label={label} className={`m-0 flex min-w-0 flex-col gap-1 text-[clamp(30px,4.6vw,52px)] font-bold leading-[1.05] tracking-[-0.03em] ${className}`}>
      {children}
    </h1>
  );
}

export function HeroLine({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <span className={`flex flex-wrap items-center gap-x-3.5 ${muted ? "text-[#8C9099]" : ""}`}>{children}</span>;
}

/** The outlined lime pill that sits inside a headline line. */
export function InlinePill({ children, icon }: { children?: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex h-[clamp(32px,3.6vw,44px)] items-center gap-2.5 rounded-full border-2 border-lime px-4 text-[clamp(13px,1.1vw,15px)] font-semibold tracking-normal text-lime">
      {icon}
      {children}
    </span>
  );
}

export function AvatarStack({ seeds, size = 46 }: { seeds: string[]; size?: number }) {
  return (
    <span aria-hidden="true" className="inline-flex">
      {seeds.map((s, i) => (
        <span key={s + i} style={{ marginLeft: i ? -12 : 0 }}>
          <Avatar seed={s} size={size} ring="#121316" />
        </span>
      ))}
    </span>
  );
}

/** The off-white panel that overlaps the dark hero, with 40px top corners. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className="-mt-12 rounded-t-[40px] bg-paper text-ink">
      <div className={`mx-auto flex max-w-[1320px] flex-col gap-[22px] px-4 pb-14 pt-8 sm:px-8 ${className}`}>{children}</div>
    </section>
  );
}

/** A plain app page: dark title, then the panel. For pages without a bespoke hero. */
export function AppPage({ title, kicker, aside, children }: { title: ReactNode; kicker?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <>
      <section className="on-dark mx-auto flex max-w-[1320px] flex-wrap items-end justify-between gap-6 px-4 pb-[80px] pt-7 text-white sm:px-8 sm:pt-9">
        <div className="space-y-3">
          {kicker && <p className="text-[15px] text-grey-dark">{kicker}</p>}
          <h1 className="m-0 text-[clamp(28px,3.6vw,40px)] font-bold leading-[1.05] tracking-[-0.03em]">{title}</h1>
        </div>
        {aside}
      </section>
      <Panel>{children}</Panel>
    </>
  );
}

/** A whole page that only says one thing: not found, an error, signed out. */
export function NoticePage({ title, children, action, kicker }: { title: string; children?: ReactNode; action?: ReactNode; kicker?: ReactNode }) {
  return (
    <AppPage title={title} kicker={kicker}>
      <div className="flex flex-col items-start gap-4 rounded-[26px] bg-white p-6 sm:p-8">
        {children && <div className="max-w-2xl text-[16px] text-grey">{children}</div>}
        {action ?? (
          <Link href="/market" className={pillClass("ink")}>
            Browse creators
          </Link>
        )}
      </div>
    </AppPage>
  );
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <h2 id={id} className="m-0 text-[clamp(20px,2vw,24px)] font-bold tracking-[-0.02em]">{children}</h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- cards

/** Decorative outline circles used on the lime and violet cards. */
export function CardRings({ stroke = "#121316", opacity = 1 }: { stroke?: string; opacity?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 320" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity }}>
      <g fill="none" stroke={stroke} strokeWidth="1.6">
        <circle cx="390" cy="20" r="110" />
        <circle cx="440" cy="300" r="130" />
      </g>
    </svg>
  );
}

/** The lime action card at the right of a hero. */
export function LimeCard({ children, label, tone = "lime" }: { children: ReactNode; label: string; tone?: "lime" | "coral" | "grey" }) {
  const bg = tone === "lime" ? "bg-lime" : tone === "coral" ? "bg-coral" : "bg-[#D9DCE2]";
  return (
    <article aria-label={label} className={`relative flex min-w-0 flex-[1_1_400px] flex-col gap-3 overflow-hidden rounded-[26px] p-6 text-ink ${bg}`}>
      <CardRings />
      <div className="relative flex h-full flex-col gap-3.5">{children}</div>
    </article>
  );
}

export function StatCard({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[26px] bg-white p-6">
      <span className="text-[15px] text-grey">{label}</span>
      <span className="tnum text-[clamp(22px,2.2vw,28px)] font-bold leading-tight">{value}</span>
      {note && <span className="text-[13px] text-grey">{note}</span>}
    </div>
  );
}

/** White card on the panel. */
export function Tile({ children, className = "", as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "article" | "section" }) {
  return <As className={`flex flex-col gap-4 rounded-[26px] bg-white p-6 ${className}`}>{children}</As>;
}

// ---------------------------------------------------------------- marquee ribbon

export function Ribbon({ words, direction, className = "" }: { words: string[]; direction: "l" | "r"; className?: string }) {
  const all = [...words, ...words, ...words, ...words];
  return (
    <div aria-hidden="true" className={`overflow-hidden py-4 ${className}`}>
      <div className={`${direction === "l" ? "lk-track-l" : "lk-track-r"} gap-10 whitespace-nowrap font-display text-[clamp(16px,2vw,22px)] font-bold`}>
        {all.map((w, i) => (
          <span key={i} className="pr-10">
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- misc

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[26px] border-2 border-dashed border-field bg-white/60 p-6">
      <h3 className="m-0 text-lg font-semibold">{title}</h3>
      {children && <div className="text-[15px] text-grey">{children}</div>}
      {action}
    </div>
  );
}

export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group rounded-[26px] bg-white p-6 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold">
        {summary}
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-4 space-y-4 text-[15px]">{children}</div>
    </details>
  );
}
