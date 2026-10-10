import { indexer } from "envio";
import { FIELDS, lower } from "./common";

indexer.onEvent({ contract: "ReceiptAnchor", event: "ReceiptAnchored", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  context.Receipt.set({
    id: p.assetHash,
    licence_id: p.licenceId.toString(),
    renderIndex: Number(p.renderIndex),
    creator: lower(p.creator),
    licensee: lower(p.licensee),
    timestamp: Number(p.timestamp),
    tx: event.transaction.hash,
  });
});
