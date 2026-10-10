"use client";
/**
 * Public profiles and brand cards for the addresses on screen, fetched in one request each and
 * cached for the page's lifetime (a removal shows on the next page load, and immediately for the
 * creator who made it).
 */
import { useEffect, useState } from "react";
import type { PublicProfile } from "@/lib/creator-profile";
import type { BrandBadge } from "@/lib/brand-policy";
import { api } from "./tx";

export type BrandCard = { address: string; name: string; logo: string | null; badge: BrandBadge; website: string };

function useBatch<T>(url: string, field: string, addresses: string[]): Record<string, T> {
  const [map, setMap] = useState<Record<string, T>>({});
  const list = [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))].sort().join(",");
  useEffect(() => {
    if (!list) return;
    let live = true;
    api<Record<string, Record<string, T>>>(`${url}?addresses=${list}`)
      .then((j) => live && setMap(j[field] ?? {}))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url, field, list]);
  return map;
}

export const useProfiles = (addresses: string[]) => useBatch<PublicProfile>("/api/profiles", "profiles", addresses);
export const useBrandCards = (addresses: string[]) => useBatch<BrandCard>("/api/brands/cards", "brands", addresses);
