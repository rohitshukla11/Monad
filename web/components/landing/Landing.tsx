"use client";

/**
 * The landing page (Main.dc.html): lime hero with dropping nav and headline, a rising portrait
 * illustration and two endless ribbons; the "Built on" strip; the dark benefits block with counters;
 * the four-step accordion; the tilted creator cards; the testimonial marquee (only with real quotes);
 * the CTA band. Motion is CSS plus an IntersectionObserver hook, and static under reduced motion.
 */
import Link from "next/link";
import { useState } from "react";
import { pillClass, Silhouette, silhouetteFor } from "@/components/ds";
import { IconArrowLeft, IconArrowRight, IconArrowUpRight, IconChevron } from "@/components/ds/icons";
import { Reveal, useCountUp, useInView } from "@/components/ds/motion";
import { BUILT_ON, MEASUREMENTS, TESTIMONIALS } from "@/lib/site-content";

export type LandingCreator = { address: string; price: string; meta: string };
export type ContractRow = { name: string; address: string; url: string; does: string };

const RIBBON_A = ["Advertising", "✳", "Social", "✳", "Editorial", "✳", "Entertainment", "✳", "Product", "✳"];
const RIBBON_B = ["Approve", "✳", "Get paid per render", "✳", "Revoke any time", "✳", "Verified humans", "✳"];

export function Landing({ creators, contracts }: { creators: LandingCreator[]; contracts: ContractRow[] }) {
  return (
    <main id="main" className="bg-ink font-sans text-ink">
      <Hero />
      <Stats />
      <HowItWorks />
      <Creators creators={creators} />
      <ForTools contracts={contracts} />
      <Quotes />
    </main>
  );
}

// ---------------------------------------------------------------- hero

function Ribbon({ words, dir, className, style }: { words: string[]; dir: "l" | "r"; className: string; style: React.CSSProperties }) {
  const all = [...words, ...words, ...words, ...words];
  return (
    <div aria-hidden="true" className={`absolute left-[calc(50%-50vw-80px)] right-[calc(50%-50vw-80px)] overflow-hidden py-4 ${className}`} style={style}>
      <div className={`${dir === "l" ? "lk-track-l" : "lk-track-r"} gap-10 whitespace-nowrap font-display text-[clamp(15px,2vw,22px)] font-bold`}>
        {all.map((w, i) => (
          <span key={i} className="pr-10">
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-lime">
      <svg aria-hidden="true" viewBox="0 0 1440 900" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <g fill="none" stroke="#C9E35F" strokeWidth="40" strokeLinecap="round">
          <path d="M-80 520 C 260 300, 520 760, 900 420 S 1400 260, 1560 360" />
          <path d="M-80 700 C 300 520, 640 900, 1000 620 S 1420 520, 1560 600" opacity="0.6" />
        </g>
      </svg>

      <header className="lk-drop relative mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-7 gap-y-1 px-4 py-[18px] sm:px-8 sm:py-[22px]">
        <Link href="/" className="font-display text-[20px] font-black tracking-[0.02em] text-ink no-underline sm:text-[22px]">
          LIKENESS
        </Link>
        <nav aria-label="Main" className="order-3 flex w-full flex-wrap gap-x-4 text-[14px] font-medium sm:gap-x-[30px] sm:text-[15px] md:order-none md:w-auto md:flex-1">
          <a href="#how" className="py-3 text-ink no-underline hover:underline">
            How it works
          </a>
          <Link href="/market" className="py-3 text-ink no-underline hover:underline">
            Creators
          </Link>
          <a href="#tools" className="py-3 text-ink no-underline hover:underline">
            For AI tools
          </a>
          <Link href="/verify" className="py-3 text-ink no-underline hover:underline">
            Verify
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-5">
          <Link href="/dashboard" className="hidden py-3 text-[15px] font-medium text-ink no-underline hover:underline sm:inline">
            Log in
          </Link>
          <Link href="/onboard" className={pillClass("ink", "min-h-12 px-[22px]")}>
            Become a creator
          </Link>
        </div>
      </header>

      <div className="relative mx-auto h-[560px] max-w-[1320px] px-4 pt-6 sm:h-[640px] sm:px-8">
        <h1 className="lk-drop absolute left-4 right-4 top-[30px] m-0 text-center font-display text-[clamp(40px,10.5vw,152px)] font-black leading-[0.95] tracking-[-0.02em] text-ink sm:left-8 sm:right-8">
          <span className="lk-texture">YOUR FACE</span>
          <br />
          YOUR TERMS
        </h1>
        <div
          aria-hidden="true"
          className="lk-rise absolute left-1/2 top-[130px] flex h-[290px] w-[220px] items-end justify-center overflow-hidden rounded-t-[180px] bg-[#F4C9D6] sm:top-[110px] sm:h-[clamp(300px,32vw,460px)] sm:w-[clamp(230px,25vw,360px)]"
          style={{ transform: "translateX(-50%)" }}
        >
          <Silhouette fill="#C27A92" width="92%" height="87%" />
        </div>
        <span className="absolute left-1/2 top-[380px] z-10 max-w-[calc(100%-32px)] -translate-x-1/2 rounded-full bg-ink px-[18px] py-2.5 text-center text-[13px] font-semibold text-lime sm:top-[430px] sm:whitespace-nowrap sm:text-[14px]">
          Illustration · verified humans only
        </span>
        <Ribbon words={RIBBON_A} dir="l" className="top-[440px] bg-violet text-white sm:top-[508px]" style={{ transform: "rotate(-5deg)" }} />
        <Ribbon words={RIBBON_B} dir="r" className="top-[488px] bg-ink text-lime sm:top-[548px]" style={{ transform: "rotate(4deg)" }} />
      </div>

      <div className="relative mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-x-9 gap-y-4 px-4 pb-9 pt-[70px] font-display text-[clamp(16px,1.6vw,20px)] font-bold text-[#3D4519] sm:px-8">
        <span className="font-sans text-[14px] font-semibold text-ink">Built on</span>
        {BUILT_ON.map((b) => (
          <span key={b}>{b}</span>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- dark benefits block

function Toggle({ on = "#DCF37B", track = "#8B5CF6" }: { on?: string; track?: string }) {
  return (
    <span aria-hidden="true" className="inline-flex h-[52px] w-[110px] items-center justify-end rounded-full px-1.5" style={{ background: track }}>
      <span className="h-10 w-10 rounded-full" style={{ background: on }} />
    </span>
  );
}

function Stats() {
  const { ref, seen } = useInView<HTMLDivElement>();
  const ms = useCountUp(MEASUREMENTS.registerMs.value, seen);
  const pct = useCountUp(MEASUREMENTS.rendersWithReceipt.value, seen);
  return (
    <section className="on-dark bg-ink text-white">
      <div ref={ref} className="mx-auto flex max-w-[1180px] flex-col gap-10 px-4 py-24 sm:px-8">
        <h2 className={`rv${seen ? " in" : ""} m-0 flex flex-wrap items-center gap-x-4 font-display text-[clamp(28px,4vw,44px)] font-extrabold leading-[1.15] tracking-[-0.01em]`}>
          LICENSE REAL FACES,
          <br />
          WITH
          <span className={`pop${seen ? " in" : ""}`}>
            <Toggle />
          </span>
          CONSENT ATTACHED
        </h2>
        <div className="flex flex-wrap gap-5">
          <article className={`rv${seen ? " in" : ""} relative flex min-h-[340px] min-w-0 flex-[2_1_560px] flex-col gap-4 overflow-hidden rounded-[30px] bg-lavender p-8 text-ink`} style={{ transitionDelay: ".1s" }}>
            <span aria-hidden="true" className="flex h-[42px] w-[72px] items-center gap-1 rounded-full border-2 border-ink px-1">
              <span className="h-8 w-8 rounded-full bg-ink" />
              <span className="h-8 w-8 rounded-full border-2 border-ink bg-lime" />
            </span>
            <div aria-hidden="true" className="absolute right-10 top-10 hidden h-[230px] w-[260px] sm:block">
              <span className="absolute left-5 top-2.5 flex h-[86px] w-[86px] items-end justify-center overflow-hidden rounded-full border-4 border-white bg-[#F6D9A8]">
                <Silhouette fill="#C08A3E" width={74} height={86} />
              </span>
              <span className="absolute left-[70px] top-24 h-1 w-[120px] origin-left rotate-[38deg] rounded bg-violet" />
              <span className="absolute bottom-0 right-2.5 flex h-24 w-24 items-end justify-center overflow-hidden rounded-full border-4 border-white bg-[#F4C9D6]">
                <Silhouette fill="#C27A92" width={82} height={96} />
              </span>
            </div>
            <span className="mt-auto self-start rounded-full bg-violet px-3.5 py-1.5 text-[13px] font-semibold text-white">For brands</span>
            <h3 className="m-0 font-display text-[clamp(20px,2.4vw,26px)] font-extrabold">VERIFIED HUMANS ONLY</h3>
            <p className="m-0 max-w-[460px] text-[15px] leading-relaxed text-[#3E4148]">
              Every creator passed an ID check, a liveness selfie and a face match. Their photos were captured live, so nobody can license a face that
              isn&apos;t theirs.
            </p>
          </article>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <article className={`rv${seen ? " in" : ""} flex flex-1 flex-col gap-1.5 rounded-[30px] bg-lime p-7 text-ink`} style={{ transitionDelay: ".25s" }} title={MEASUREMENTS.registerMs.source}>
              <span className="tnum font-display text-[clamp(40px,5vw,52px)] font-black leading-none">{ms} MS</span>
              <span className="font-display text-[17px] font-bold leading-snug">TO REGISTER A CREATOR ON MONAD</span>
              <span className="text-[13px] text-[#3E4148]">Measured on Monad testnet, send to receipt.</span>
            </article>
            <article className={`rv${seen ? " in" : ""} flex flex-1 flex-col gap-1.5 rounded-[30px] bg-ink-line p-7 text-white`} style={{ transitionDelay: ".4s" }} title={MEASUREMENTS.rendersWithReceipt.source}>
              <span className="tnum font-display text-[clamp(40px,5vw,52px)] font-black leading-none text-lime">{pct}%</span>
              <span className="font-display text-[17px] font-bold leading-snug">OF RENDERS CARRY A RECEIPT</span>
              <span className="text-[13px] text-grey-dark">By design: payment and receipt are one transaction.</span>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- how it works

const STEPS = [
  { title: "PROVE IT'S YOU", body: "An ID check for 18+, a liveness selfie, and three guided photos matched to it. The verification session is deleted once you're attested." },
  { title: "SET YOUR TERMS", body: "Pick uses, regions, a price per render and a cap. Political, adult, minor-involving, impersonating and deceptive uses are banned in the contract." },
  { title: "APPROVE BRANDS", body: "A brand requests a licence and you approve it. Your photos are released to that licence only, unlocked with your passkey (Face ID or Touch ID)." },
  { title: "GET PAID, OR REVOKE", body: "Each render pays you and records a receipt in one Monad transaction. Revoke and the next render is refused." },
];

function HowItWorks() {
  const [open, setOpen] = useState(0);
  const { ref, seen } = useInView<HTMLDivElement>();
  const c = (k: string) => `${k}${seen ? " in" : ""}`;
  return (
    <section id="how" className="scroll-mt-4 overflow-hidden bg-white">
      <div ref={ref} className="mx-auto flex max-w-[1180px] flex-col gap-12 px-4 py-24 sm:px-8">
        <h2 className="m-0 text-center font-display text-[clamp(28px,4vw,44px)] font-extrabold leading-[1.2] tracking-[-0.01em]">
          <span className={`${c("from-l")} inline-block`}>FROM SELFIE</span>{" "}
          <span aria-hidden="true" className={`${c("pop")} inline-flex h-12 w-24 items-center gap-1 rounded-full bg-ink px-[5px] align-middle`}>
            <span className="h-[38px] w-[38px] rounded-full bg-lime" />
            <span className="h-[38px] w-[38px] rounded-full border-2 border-lime" />
          </span>{" "}
          <span className={`${c("from-r")} inline-block`}>TO PAID RENDER</span>
          <br />
          <span className={`${c("rv")} inline-block`}>IN FOUR STEPS</span>
        </h2>
        <div className="flex flex-wrap items-start gap-10">
          <ol className="m-0 flex min-w-0 flex-[1_1_460px] list-none flex-col gap-3.5 p-0">
            {STEPS.map((s, i) => {
              const isOpen = open === i;
              return (
                <li key={s.title} className={`${c("rv")} rounded-[20px] bg-[#EAF2FB] px-[22px] py-5`} style={{ transitionDelay: `${0.15 + i * 0.12}s` }}>
                  <h3 className="m-0">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`step-${i}`}
                      onClick={() => setOpen(isOpen ? -1 : i)}
                      className="flex min-h-11 w-full cursor-pointer items-center gap-3.5 border-0 bg-transparent p-0 text-left text-ink"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink font-sans font-semibold text-white">{i + 1}</span>
                      <span className="flex-1 font-display text-[16px] font-bold">{s.title}</span>
                      <IconChevron size={20} className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                  </h3>
                  <div id={`step-${i}`} className={`acc-body${isOpen ? " open" : ""}`}>
                    <div className="overflow-hidden">
                      <p className="m-0 mt-3 pl-[50px] text-[15px] leading-relaxed text-[#3E4148]">{s.body}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className={`${c("rv")} flex min-w-0 flex-[1_1_440px] flex-col gap-[18px]`} style={{ transitionDelay: ".3s" }}>
            <p className="m-0 text-[16px] leading-relaxed text-[#3E4148]">
              Political, adult and deceptive uses are banned in the contract itself. You choose everything else, and you can pull a licence back in one
              click.
            </p>
            <div className="relative flex aspect-[4/3] items-end justify-center overflow-hidden rounded-[28px] bg-[#F6D9A8]">
              <Silhouette fill="#C08A3E" width="70%" height="94%" />
              <div
                className={`${c("from-l")} absolute left-[18px] top-1/2 -mt-[60px] flex flex-col gap-2.5 rounded-[18px] bg-white px-3.5 py-3 text-[13px] shadow-[0_12px_30px_rgba(18,19,22,0.15)]`}
                style={{ transitionDelay: ".7s" }}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-ok" />
                  <b className="font-semibold">Advertising licence</b> · licensed
                </span>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-violet" />
                  <b className="font-semibold">Social request</b> · waiting
                </span>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-bad" />
                  <b className="font-semibold">Product licence</b> · revoked
                </span>
              </div>
            </div>
            <Link href="/onboard" className={pillClass("ink", "min-h-[54px]")}>
              Get started
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- creators

const FRAMES = ["#F6C9DD", "#DCF37B", "#C9B8FA", "#BFE3C9"];
const TILTS: [string, string][] = [
  ["-5deg", "0px"],
  ["2deg", "40px"],
  ["-3deg", "-10px"],
];

function Creators({ creators }: { creators: LandingCreator[] }) {
  const [shift, setShift] = useState(0);
  const { ref, seen } = useInView<HTMLDivElement>();
  // Real creators only; any free slots become an invitation, never a sample person.
  const slots: (LandingCreator | null)[] = creators.length >= 3 ? creators : [...creators, ...Array<null>(3 - creators.length).fill(null)];
  const shown = [0, 1, 2].map((i) => slots[(i + shift) % slots.length]);
  const canRotate = creators.length > 1;
  return (
    <section className="relative overflow-hidden bg-sky">
      <svg aria-hidden="true" viewBox="0 0 1440 800" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <g fill="#E2F0F9">
          <path d="M-100 700 L 500 -100 L 620 -100 L 20 700 Z" />
          <path d="M600 900 L 1300 -100 L 1380 -100 L 680 900 Z" />
        </g>
      </svg>
      <div ref={ref} className="relative mx-auto flex max-w-[1180px] flex-col gap-10 px-4 pb-[120px] pt-24 sm:px-8">
        <div className={`rv${seen ? " in" : ""} flex flex-wrap items-center justify-center gap-4`}>
          <h2 className="m-0 font-display text-[clamp(28px,4vw,44px)] font-extrabold leading-[1.2]">MEET THE CREATORS</h2>
          <button
            type="button"
            aria-label="Previous creator"
            disabled={!canRotate}
            onClick={() => setShift((s) => (s + slots.length - 1) % slots.length)}
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-transparent disabled:opacity-40"
          >
            <IconArrowLeft size={20} />
          </button>
          <button
            type="button"
            aria-label="Next creator"
            disabled={!canRotate}
            onClick={() => setShift((s) => (s + 1) % slots.length)}
            className="flex h-12 w-12 items-center justify-center rounded-full border-0 bg-ink text-white disabled:opacity-40"
          >
            <IconArrowRight size={20} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-7 sm:grid-cols-3">
          {shown.map((cr, i) => {
            const transform = seen ? `rotate(${TILTS[i][0]}) translateY(${TILTS[i][1]})` : "translateX(160px) rotate(8deg)";
            const style = { transform, transitionDelay: `${0.1 + i * 0.18}s`, background: FRAMES[(i + shift) % FRAMES.length] };
            if (!cr)
              return (
                <Link key={`empty-${i}`} href="/onboard" className={`card-in${seen ? " in" : ""} relative block rounded-[30px] p-3.5 text-ink no-underline`} style={style}>
                  <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed border-ink/40 bg-white/50 p-6 text-center">
                    <span className="font-display text-[15px] font-bold">YOUR FACE HERE</span>
                    <span className="text-[14px] text-[#3E4148]">Verify once, set your terms, and get paid per render.</span>
                    <span className={pillClass("ink")}>Become a creator</span>
                  </div>
                </Link>
              );
            const s = silhouetteFor(cr.address);
            return (
              <Link key={cr.address + i} href={`/market/${cr.address}`} className={`card-in${seen ? " in" : ""} relative block rounded-[30px] p-3.5 text-ink no-underline`} style={style}>
                <span className="absolute left-[22px] top-[22px] z-10 rounded-full bg-white px-3 py-1.5 font-display text-[12px] font-bold">{cr.price} / RENDER</span>
                <span aria-hidden="true" className="absolute right-[22px] top-[22px] z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/70">
                  <IconArrowUpRight size={18} />
                </span>
                <div className="flex aspect-[4/5] items-end justify-center overflow-hidden rounded-[22px]" style={{ background: s.tint }}>
                  <Silhouette fill={s.sil} width="82%" height="92%" />
                </div>
                <div className="absolute bottom-[26px] left-[26px] flex flex-col rounded-2xl bg-white px-3.5 py-2.5">
                  <span className="tnum font-display text-[15px] font-bold">
                    {cr.address.slice(0, 6)}…{cr.address.slice(-4)}
                  </span>
                  <span className="text-[12px] text-grey">{cr.meta}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- for AI tools

function ForTools({ contracts }: { contracts: ContractRow[] }) {
  return (
    <section id="tools" className="scroll-mt-4 bg-paper">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-4 py-24 sm:px-8">
        <Reveal>
          <h2 className="m-0 font-display text-[clamp(28px,4vw,44px)] font-extrabold leading-[1.2]">FOR AI TOOLS AND VERIFIERS</h2>
          <p className="mt-4 max-w-3xl text-[16px] leading-relaxed text-[#3E4148]">
            Likeness is a protocol; this app is its reference client. Any image tool can check a licence, pay per render and anchor a receipt
            through the same four contracts on Monad, and anyone can check a file.
          </p>
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2">
          {contracts.map((c, i) => (
            <Reveal key={c.name} delay={0.08 * i} as="article" className="flex flex-col gap-2 rounded-[26px] bg-white p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="m-0 text-[18px] font-semibold">{c.name}</h3>
                <a href={c.url} target="_blank" rel="noreferrer" className="tnum font-mono text-[13px] text-wait">
                  {c.address.slice(0, 8)}…{c.address.slice(-4)}
                  <span className="sr-only"> (opens MonadVision)</span>
                </a>
              </div>
              <p className="m-0 text-[15px] text-grey">{c.does}</p>
            </Reveal>
          ))}
        </div>
        <Link href="/verify" className={pillClass("ink", "self-start")}>
          Verify a file
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- testimonials and CTA

function Quotes() {
  const { ref, seen } = useInView<HTMLDivElement>();
  const c = (k: string) => `${k}${seen ? " in" : ""}`;
  const bgs = [
    ["#1F4D3A", "#FFFFFF"],
    ["#E3EFF9", "#121316"],
    ["#FBE3EC", "#121316"],
    ["#ECE6FD", "#121316"],
    ["#DCF37B", "#121316"],
  ];
  return (
    <section className="overflow-hidden bg-white">
      <div ref={ref} className="flex flex-col gap-11 py-24">
        {TESTIMONIALS.length > 0 && (
          <>
            <h2 className="m-0 px-4 text-center font-display text-[clamp(28px,4vw,44px)] font-extrabold leading-[1.2] sm:px-8">
              <span className={`${c("from-l")} inline-block`}>HEAR IT</span>{" "}
              <span aria-hidden="true" className={`${c("pop")} inline-flex h-12 w-24 items-center gap-1 rounded-full bg-lime px-[5px] align-middle`}>
                <span className="h-[38px] w-[38px] rounded-full bg-ink" />
                <span className="h-[38px] w-[38px] rounded-full border-2 border-ink" />
              </span>{" "}
              <span className={`${c("from-r")} inline-block`}>FROM CREATORS</span>
            </h2>
            <div className="lk-marquee overflow-hidden" aria-label="Quotes, scrolling; hover or focus to pause" tabIndex={0}>
              <div className="lk-quotes">
                {[...TESTIMONIALS, ...TESTIMONIALS].map((q, i) => (
                  <blockquote
                    key={i}
                    aria-hidden={i >= TESTIMONIALS.length ? true : undefined}
                    className="m-0 box-border flex min-h-[240px] w-[290px] shrink-0 flex-col gap-[18px] rounded-3xl p-6"
                    style={{ background: bgs[i % bgs.length][0], color: bgs[i % bgs.length][1] }}
                  >
                    <p className="m-0 text-[15px] leading-relaxed">{q.quote}</p>
                    <footer className="mt-auto font-display text-[13px] font-bold">
                      {q.name}
                      <br />
                      <span className="font-sans font-normal opacity-80">{q.role}</span>
                    </footer>
                  </blockquote>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="px-4 sm:px-8">
          <div className={`${c("rv")} mx-auto flex max-w-[1116px] flex-wrap items-center justify-between gap-5 rounded-[28px] bg-lime px-[34px] py-[30px]`}>
            <h2 className="m-0 font-display text-[clamp(20px,2.6vw,28px)] font-extrabold leading-[1.25]">
              READY TO LICENSE YOUR FACE
              <br />
              ON YOUR TERMS?
            </h2>
            <Link href="/onboard" className={pillClass("ink", "min-h-[54px] px-7")}>
              Get started
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
