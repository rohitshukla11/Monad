/** Small shared pieces, in the Whistle tokens (globals.css). */
import Link from "next/link";
import type { ReactNode } from "react";
import { explorer } from "@/lib/chain";
import type { LicenceStatus, Trust } from "@/lib/licensing";
import { LIVENESS_NOTE } from "@/lib/verification";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-line bg-panel p-8 text-sm ${className}`}>{children}</section>;
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-xl font-semibold">{children}</h2>;
}

type Tone = "up" | "down" | "warn" | "blue" | "dim";
const tones: Record<Tone, string> = {
  up: "border-up/40 text-up",
  down: "border-down/40 text-down",
  warn: "border-warn/40 text-warn",
  blue: "border-blue/40 text-blue",
  dim: "border-line text-dim",
};

export function Badge({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function TrustBadge({ trust }: { trust: Trust }) {
  if (trust.level === "verified")
    return (
      <span className="inline-flex gap-1.5">
        <Badge tone="up" title={`Didit: ID 18+, liveness, selfie-to-ID face match. Providers: ${trust.liveness}, ${trust.age}.`}>
          Verified{trust.sandbox ? " · Didit sandbox" : ""}
        </Badge>
        <Badge tone={trust.livenessMethod === "passive" || trust.livenessMethod === "unknown" ? "warn" : "up"} title={LIVENESS_NOTE[trust.livenessMethod]}>
          {trust.livenessMethod === "flash" ? "active" : trust.livenessMethod} liveness
        </Badge>
      </span>
    );
  if (trust.level === "unverified-test")
    return (
      <Badge tone="warn" title="Seeded for local testing. No liveness or ID check was run.">
        Unverified test creator
      </Badge>
    );
  return <Badge tone="down" title={`Liveness: ${trust.liveness || "none"}. Age: ${trust.age || "none"}.`}>Unknown attestation</Badge>;
}

export function StatusBadge({ status }: { status: LicenceStatus }) {
  const tone: Tone = status === "Active" ? "up" : status === "Revoked" ? "down" : status === "Unknown" ? "dim" : "warn";
  return <Badge tone={tone}>{status}</Badge>;
}

export function Button({
  children,
  onClick,
  disabled,
  kind = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  type?: "button" | "submit";
}) {
  const k = {
    primary: "bg-text text-ground",
    secondary: "border border-line",
    danger: "border border-down/60 text-down hover:bg-down/10",
    ghost: "text-dim hover:text-text",
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50 ${k}`}>
      {children}
    </button>
  );
}

export function Tx({ hash, ms }: { hash: string; ms?: number }) {
  return (
    <a className="font-mono text-xs text-blue hover:underline" href={explorer.tx(hash)} target="_blank" rel="noreferrer">
      {hash.slice(0, 10)}…{hash.slice(-6)}
      {ms !== undefined && <span className="text-dim"> · confirmed in {ms} ms</span>}
    </a>
  );
}

export function Addr({ a, href }: { a: string; href?: string }) {
  const short = `${a.slice(0, 6)}…${a.slice(-4)}`;
  return href ? (
    <Link href={href} className="tnum font-mono hover:text-blue">
      {short}
    </Link>
  ) : (
    <a href={explorer.address(a)} target="_blank" rel="noreferrer" className="tnum font-mono hover:text-blue">
      {short}
    </a>
  );
}

export function Note({ tone = "warn", children }: { tone?: Tone; children: ReactNode }) {
  return <p className={`text-sm ${tone === "warn" ? "text-warn" : tone === "down" ? "text-down" : tone === "up" ? "text-up" : "text-dim"}`}>{children}</p>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-wider text-dim">{label}</span>
      {children}
      {hint && <span className="block text-xs text-dim">{hint}</span>}
    </label>
  );
}

export const inputClass = "w-full rounded-full border border-line bg-surface px-4 py-2 text-sm";

export const fmtDate = (unix: number | bigint) => new Date(Number(unix) * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
