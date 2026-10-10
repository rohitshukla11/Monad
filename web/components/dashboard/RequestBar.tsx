/** The oldest licence request waiting for the creator, as a slim lime bar. */
import type { ReactNode } from "react";
import { btnClass, Initial } from "@/components/ds";
import type { BrandCard } from "@/lib/client/profiles";

export function RequestBar({
  brand,
  fallbackName,
  terms,
  waiting,
  busy,
  onApprove,
  onDecline,
}: {
  brand?: BrandCard;
  fallbackName: string;
  terms: ReactNode;
  /** How many requests are waiting in all. */
  waiting: number;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const name = brand?.name || fallbackName;
  return (
    <section aria-label="Request waiting for you" className="flex flex-wrap items-center gap-4 rounded-[20px] bg-lime px-[18px] py-4">
      {brand?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full bg-white object-contain" />
      ) : (
        <Initial name={name} size={48} />
      )}
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
          {name} wants to license you
          {brand ? (
            <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${brand.badge === "verified-domain" ? "bg-ink text-lime" : "bg-white/70 text-wait"}`}>
              {brand.badge === "verified-domain" ? "Verified domain" : "Unverified brand"}
            </span>
          ) : (
            <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[12px] font-semibold text-grey">No brand profile</span>
          )}
          {waiting > 1 && <span className="text-[13px] font-medium">· {waiting} waiting</span>}
        </span>
        <span className="text-[14px] text-[#3D4519]">{terms}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onDecline} className={btnClass("outline-dark")}>
          Decline
        </button>
        <button type="button" disabled={busy} onClick={onApprove} className={btnClass("ink")}>
          Approve
        </button>
      </div>
    </section>
  );
}
