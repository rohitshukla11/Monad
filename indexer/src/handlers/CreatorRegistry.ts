import { indexer, type Creator } from "envio";
import { at, FIELDS, lower } from "./common";

const blankCreator = (id: string): Creator => ({
  id,
  payout: "",
  referenceSetHash: "",
  registeredAt: 0,
  attestationUpdatedAt: undefined,
  categories: 0,
  regions: 0,
  maxDuration: 0n,
  maxRenders: 0,
  pricePerRender: 0n,
  autoApprove: false,
  active: false,
  suspended: false,
  epoch: 0,
  licenceCount: 0,
  renderCount: 0,
  earned: 0n,
});

indexer.onEvent({ contract: "CreatorRegistry", event: "CreatorRegistered", fields: FIELDS }, async ({ event, context }) => {
  const creator = lower(event.params.creator);
  context.CreatorRegistered.set({ ...at(event), creator, payout: lower(event.params.payout), referenceSetHash: event.params.referenceSetHash });
  const c = (await context.Creator.get(creator)) ?? blankCreator(creator);
  context.Creator.set({ ...c, payout: lower(event.params.payout), referenceSetHash: event.params.referenceSetHash, registeredAt: event.block.timestamp, active: true });
});

indexer.onEvent({ contract: "CreatorRegistry", event: "AttestationUpdated", fields: FIELDS }, async ({ event, context }) => {
  const creator = lower(event.params.creator);
  context.AttestationUpdated.set({ ...at(event), creator, referenceSetHash: event.params.referenceSetHash, verifiedAt: Number(event.params.verifiedAt) });
  const c = await context.Creator.get(creator);
  if (c) context.Creator.set({ ...c, referenceSetHash: event.params.referenceSetHash, attestationUpdatedAt: event.block.timestamp });
});

indexer.onEvent({ contract: "CreatorRegistry", event: "TermsSet", fields: FIELDS }, async ({ event, context }) => {
  const creator = lower(event.params.creator);
  context.TermsSet.set({ ...at(event), creator });
  const t = event.params.terms;
  const c = (await context.Creator.get(creator)) ?? blankCreator(creator);
  context.Creator.set({
    ...c,
    categories: Number(t.categories),
    regions: Number(t.regions),
    maxDuration: t.maxDuration,
    maxRenders: Number(t.maxRenders),
    pricePerRender: t.pricePerRender,
    autoApprove: t.autoApprove,
  });
});

indexer.onEvent({ contract: "CreatorRegistry", event: "PayoutSet", fields: FIELDS }, async ({ event, context }) => {
  const c = await context.Creator.get(lower(event.params.creator));
  if (c) context.Creator.set({ ...c, payout: lower(event.params.payout) });
});

indexer.onEvent({ contract: "CreatorRegistry", event: "ActiveSet", fields: FIELDS }, async ({ event, context }) => {
  const c = await context.Creator.get(lower(event.params.creator));
  if (c) context.Creator.set({ ...c, active: event.params.active });
});

indexer.onEvent({ contract: "CreatorRegistry", event: "AllRevoked", fields: FIELDS }, async ({ event, context }) => {
  const creator = lower(event.params.creator);
  context.AllRevoked.set({ ...at(event), creator, epoch: Number(event.params.epoch) });
  const c = await context.Creator.get(creator);
  if (c) context.Creator.set({ ...c, epoch: Number(event.params.epoch) });
});

indexer.onEvent({ contract: "CreatorRegistry", event: "Suspended", fields: FIELDS }, async ({ event, context }) => {
  const creator = lower(event.params.creator);
  context.Suspended.set({ ...at(event), creator, suspended: event.params.suspended, epoch: Number(event.params.epoch) });
  const c = await context.Creator.get(creator);
  if (c) context.Creator.set({ ...c, suspended: event.params.suspended, epoch: Number(event.params.epoch) });
});
