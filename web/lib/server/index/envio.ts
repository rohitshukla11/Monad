import "server-only";
/**
 * Reads the Envio HyperIndex (indexer/) into the normalised History shape. Two transports, same tables:
 *  - ENVIO_GRAPHQL_URL: Hasura's GraphQL API (Envio's Docker setup, or Envio's hosted service);
 *  - ENVIO_PG_URL: the indexer's Postgres directly, for a local run without Docker/Hasura.
 * Event entities carry exactly the History row fields (see indexer/schema.graphql).
 */
import type { Address, Hex } from "viem";
import { emptyHistory, type History } from "./types";

const TABLES = {
  creators: { entity: "CreatorRegistered", fields: ["creator", "payout", "referenceSetHash"] },
  terms: { entity: "TermsSet", fields: ["creator"] },
  attestationUpdates: { entity: "AttestationUpdated", fields: ["creator", "referenceSetHash", "verifiedAt"] },
  licences: {
    entity: "LicenceIssued",
    fields: ["licenceId", "creator", "licensee", "category", "regions", "end", "renderCap", "pricePerRender", "purposeHash", "autoApproved"],
  },
  revocations: { entity: "LicenceRevoked", fields: ["licenceId", "creator"] },
  revokeAlls: { entity: "AllRevoked", fields: ["creator", "epoch"] },
  suspensions: { entity: "Suspended", fields: ["creator", "suspended", "epoch"] },
  deposits: { entity: "Deposited", fields: ["licenceId", "licensee", "amount"] },
  renders: { entity: "RenderPaid", fields: ["licenceId", "renderIndex", "assetHash", "agent", "payout", "creatorAmount", "fee"] },
  refunds: { entity: "Refunded", fields: ["licenceId", "licensee", "amount"] },
} as const;

const COMMON = ["block", "timestamp", "tx", "logIndex"] as const;
type Raw = Record<string, unknown>;

function normalise(key: keyof typeof TABLES, r: Raw): Raw {
  const out: Raw = { block: Number(r.block), timestamp: Number(r.timestamp), tx: r.tx as Hex, logIndex: Number(r.logIndex) };
  for (const f of TABLES[key].fields) {
    const v = r[f];
    if (f === "licenceId") out[key === "licences" || key === "revocations" ? "id" : "licenceId"] = String(v);
    else if (["category", "regions", "end", "renderCap", "renderIndex", "epoch", "verifiedAt"].includes(f)) out[f] = Number(v);
    else if (["pricePerRender", "amount", "creatorAmount", "fee"].includes(f)) out[f] = String(v);
    else if (typeof v === "string" && v.startsWith("0x") && v.length === 42) out[f] = v.toLowerCase() as Address;
    else out[f] = v;
  }
  return out;
}

async function viaGraphql(url: string): Promise<Record<string, Raw[]>> {
  const query = `{ ${Object.entries(TABLES)
    .map(([k, t]) => `${k}: ${t.entity}(order_by: {block: asc, logIndex: asc}) { ${[...COMMON, ...t.fields].join(" ")} }`)
    .join("\n")} }`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.ENVIO_GRAPHQL_SECRET) headers["x-hasura-admin-secret"] = process.env.ENVIO_GRAPHQL_SECRET;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ query }), cache: "no-store", signal: AbortSignal.timeout(5000) });
  const j = (await r.json()) as { data?: Record<string, Raw[]>; errors?: { message: string }[] };
  if (!r.ok || j.errors || !j.data) throw new Error(j.errors?.[0]?.message ?? `GraphQL ${r.status}`);
  return j.data;
}

async function viaPostgres(url: string): Promise<Record<string, Raw[]>> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    const schema = process.env.ENVIO_PG_SCHEMA ?? "public";
    const out: Record<string, Raw[]> = {};
    for (const [k, t] of Object.entries(TABLES)) {
      const cols = [...COMMON, ...t.fields].map((c) => `"${c}"`).join(", ");
      const res = await client.query(`select ${cols} from "${schema}"."${t.entity}" order by "block", "logIndex"`);
      out[k] = res.rows;
    }
    return out;
  } finally {
    await client.end();
  }
}

export async function envioHistory(target: { graphql?: string; pg?: string }): Promise<History> {
  const data = target.graphql ? await viaGraphql(target.graphql) : await viaPostgres(target.pg!);
  const h = emptyHistory("envio");
  for (const key of Object.keys(TABLES) as (keyof typeof TABLES)[]) {
    (h[key] as Raw[]) = (data[key] ?? []).map((r) => normalise(key, r));
    for (const r of h[key]) h.head = Math.max(h.head, r.block);
  }
  return h;
}
