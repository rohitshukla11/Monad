import { Landing, type LandingCreator } from "@/components/landing/Landing";
import { regionLabels } from "@/lib/categories";
import { usdc } from "@/lib/licensing";
import { listCreators } from "@/lib/server/protocol";

export const dynamic = "force-dynamic";

export default async function Home() {
  let creators: LandingCreator[] = [];
  try {
    creators = (await listCreators())
      .filter((c) => c.trust.level === "verified" && c.canLicense)
      .map((c) => ({
        address: c.address,
        price: `$${usdc.format(c.terms.pricePerRender)}`,
        meta: `${c.trust.level === "verified" && c.trust.livenessMethod === "passive" ? "Passive" : "Full"} liveness · ${regionLabels(c.terms.regions).join(", ")}`,
      }));
  } catch {
    // The landing page still renders without chain access; the creators section then invites sign-ups.
  }
  return <Landing creators={creators} />;
}
