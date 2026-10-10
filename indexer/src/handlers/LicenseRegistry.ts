import { indexer } from "envio";
import { at, FIELDS, lower } from "./common";

indexer.onEvent({ contract: "LicenseRegistry", event: "LicenceIssued", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const creator = lower(p.creator);
  const licensee = lower(p.licensee);
  context.LicenceIssued.set({
    ...at(event),
    licenceId: p.id,
    creator,
    licensee,
    category: Number(p.category),
    regions: Number(p.regions),
    end: Number(p.end),
    renderCap: Number(p.renderCap),
    pricePerRender: p.pricePerRender,
    purposeHash: p.purposeHash,
    autoApproved: p.autoApproved,
  });
  const c = await context.Creator.get(creator);
  context.Licence.set({
    id: p.id.toString(),
    creator_id: creator,
    licensee,
    category: Number(p.category),
    regions: Number(p.regions),
    issuedAt: event.block.timestamp,
    end: Number(p.end),
    renderCap: Number(p.renderCap),
    renderCount: 0,
    pricePerRender: p.pricePerRender,
    purposeHash: p.purposeHash,
    autoApproved: p.autoApproved,
    creatorEpoch: c?.epoch ?? 0,
    revokedAt: undefined,
    deposited: 0n,
    paidToCreator: 0n,
    fees: 0n,
    refunded: 0n,
  });
  if (c) context.Creator.set({ ...c, licenceCount: c.licenceCount + 1 });
  const b = (await context.Brand.get(licensee)) ?? { id: licensee, licenceCount: 0, deposited: 0n, spent: 0n, refunded: 0n };
  context.Brand.set({ ...b, licenceCount: b.licenceCount + 1 });
});

indexer.onEvent({ contract: "LicenseRegistry", event: "LicenceRevoked", fields: FIELDS }, async ({ event, context }) => {
  context.LicenceRevoked.set({ ...at(event), licenceId: event.params.id, creator: lower(event.params.creator) });
  const l = await context.Licence.get(event.params.id.toString());
  if (l) context.Licence.set({ ...l, revokedAt: event.block.timestamp });
});

indexer.onEvent({ contract: "LicenseRegistry", event: "RenderRecorded", fields: FIELDS }, async ({ event, context }) => {
  const l = await context.Licence.get(event.params.id.toString());
  if (l) context.Licence.set({ ...l, renderCount: Number(event.params.renderIndex) + 1 });
});
