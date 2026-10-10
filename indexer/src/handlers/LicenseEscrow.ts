import { indexer } from "envio";
import { at, FIELDS, lower } from "./common";

indexer.onEvent({ contract: "LicenseEscrow", event: "Deposited", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  context.Deposited.set({ ...at(event), licenceId: p.licenceId, licensee: lower(p.licensee), amount: p.amount });
  const l = await context.Licence.get(p.licenceId.toString());
  if (l) context.Licence.set({ ...l, deposited: l.deposited + p.amount });
  const b = await context.Brand.get(lower(p.licensee));
  if (b) context.Brand.set({ ...b, deposited: b.deposited + p.amount });
});

indexer.onEvent({ contract: "LicenseEscrow", event: "RenderPaid", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  context.RenderPaid.set({
    ...at(event),
    licenceId: p.licenceId,
    renderIndex: Number(p.renderIndex),
    assetHash: p.assetHash,
    agent: lower(p.agent),
    payout: lower(p.payout),
    creatorAmount: p.creatorAmount,
    fee: p.fee,
  });
  const l = await context.Licence.get(p.licenceId.toString());
  if (!l) return;
  context.Licence.set({ ...l, paidToCreator: l.paidToCreator + p.creatorAmount, fees: l.fees + p.fee });
  const c = await context.Creator.get(l.creator_id);
  if (c) context.Creator.set({ ...c, renderCount: c.renderCount + 1, earned: c.earned + p.creatorAmount });
  const b = await context.Brand.get(l.licensee);
  if (b) context.Brand.set({ ...b, spent: b.spent + p.creatorAmount + p.fee });
});

indexer.onEvent({ contract: "LicenseEscrow", event: "Refunded", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  context.Refunded.set({ ...at(event), licenceId: p.licenceId, licensee: lower(p.licensee), amount: p.amount });
  const l = await context.Licence.get(p.licenceId.toString());
  if (l) context.Licence.set({ ...l, refunded: l.refunded + p.amount });
  const b = await context.Brand.get(lower(p.licensee));
  if (b) context.Brand.set({ ...b, refunded: b.refunded + p.amount });
});

// Registered for completeness: which agents may sign renders. Not stored as an entity.
indexer.onEvent({ contract: "LicenseEscrow", event: "RenderAgentSet", fields: FIELDS }, async ({ event, context }) => {
  context.log.info(`render agent ${event.params.agent} ${event.params.allowed ? "allowed" : "removed"}`);
});
