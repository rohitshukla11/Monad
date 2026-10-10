import type { Metadata } from "next";
import { Marketplace, type MarketCreator } from "@/components/market/Marketplace";
import { AppPage } from "@/components/ds";
import { Note } from "@/components/ui";
import { categoryLabels, regionLabels } from "@/lib/categories";
import { usdc } from "@/lib/licensing";
import { historySource } from "@/lib/server/index";
import { publicProfiles } from "@/lib/server/profiles";
import { listCreators } from "@/lib/server/protocol";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketplace" };

export default async function MarketPage() {
  let creators: MarketCreator[];
  try {
    // Only creators Didit has verified, who accept new licences, and who chose to be listed with a public photo.
    const verified = (await listCreators()).filter((c) => c.trust.level === "verified" && c.canLicense);
    const profiles = await publicProfiles(verified.map((c) => c.address));
    creators = verified
      .filter((c) => profiles[c.address.toLowerCase()]?.listed)
      .map((c) => ({
        address: c.address,
        priceUnits: c.terms.pricePerRender.toString(),
        price: `$${usdc.format(c.terms.pricePerRender)}`,
        region: regionLabels(c.terms.regions).join(", "),
        liveness: c.trust.level === "verified" && c.trust.livenessMethod === "passive" ? "Passive" : "Full",
        uses: categoryLabels(c.terms.categories),
        autoApprove: c.terms.autoApprove,
        registeredAt: c.registeredAt ?? 0,
        photo: profiles[c.address.toLowerCase()]?.photo ?? null,
        photoAi: !!profiles[c.address.toLowerCase()]?.photoAi,
        tags: [...(profiles[c.address.toLowerCase()]?.tags.tone ?? []), ...(profiles[c.address.toLowerCase()]?.tags.setting ?? [])],
      }));
  } catch (e) {
    return (
      <AppPage title="Marketplace">
        <Note tone="down">Could not read the creator registry: {(e as Error).message}</Note>
      </AppPage>
    );
  }
  return <Marketplace creators={creators} source={historySource() === "envio" ? "the Envio indexer" : "Monad testnet (RPC)"} />;
}
