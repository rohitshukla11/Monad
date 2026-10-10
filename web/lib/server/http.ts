import "server-only";
import { isAddress, type Address } from "viem";

export const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** Map any thrown error to a JSON response; errors with a numeric `status` keep it. */
export function fail(e: unknown) {
  const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : 500;
  const message = e instanceof Error ? e.message : "failed";
  if (status >= 500) console.error(JSON.stringify({ service: "api", error: message.slice(0, 500) }));
  return json({ error: message }, status);
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function address(v: string | null | undefined, name = "address"): Address {
  if (!v || !isAddress(v)) throw new HttpError(400, `bad ${name}`);
  return v.toLowerCase() as Address;
}

export function licenceId(v: string): bigint {
  if (!/^[1-9]\d{0,30}$/.test(v)) throw new HttpError(400, "bad licence id");
  return BigInt(v);
}
