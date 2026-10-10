import { Landing, type LandingCreator } from "@/components/landing/Landing";
import { regionLabels } from "@/lib/categories";
import { usdc } from "@/lib/licensing";
import { publicProfiles } from "@/lib/server/profiles";
import { listCreators } from "@/lib/server/protocol";

export const dynamic = "force-dynamic";

export default async function Home() {
  let creators: LandingCreator[] = [];
  try {
    // Real creators who chose to be listed with a public photo; none means the section is hidden.
    const verified = (await listCreators()).filter((c) => c.trust.level === "verified" && c.canLicense);
    const profiles = await publicProfiles(verified.map((c) => c.address));
    creators = verified
      .filter((c) => profiles[c.address.toLowerCase()]?.listed && profiles[c.address.toLowerCase()]?.photo)
      .map((c) => ({
        address: c.address,
        price: `$${usdc.format(c.terms.pricePerRender)}`,
        meta: `${c.trust.level === "verified" && c.trust.livenessMethod === "passive" ? "Passive" : "Full"} liveness · ${regionLabels(c.terms.regions).join(", ")}`,
        photo: profiles[c.address.toLowerCase()]!.photo!,
      }));
  } catch {
    // Without chain access the landing page still renders, without the creators section.
  }
  return <Landing creators={creators} />;
}
