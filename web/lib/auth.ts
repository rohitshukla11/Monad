/**
 * Wallet-signed requests. Actions that spend a brand's escrow or change its delegation carry an
 * EIP-191 signature from the wallet over a short, human-readable statement, so nobody else can
 * trigger them. The same builder runs in the browser (to sign) and on the server (to verify).
 */
export type SignedAction = { message: string; signature: `0x${string}` };

export function actionMessage(action: string, fields: Record<string, string | number | bigint>, issuedAt = Date.now()): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v.toString()}`);
  return [`Likeness: ${action}`, ...lines, `issued: ${new Date(issuedAt).toISOString()}`].join("\n");
}

export function parseActionMessage(message: string): { action: string; fields: Record<string, string>; issuedAt: number } | null {
  const [head, ...rest] = message.split("\n");
  if (!head?.startsWith("Likeness: ")) return null;
  const fields: Record<string, string> = {};
  for (const line of rest) {
    const i = line.indexOf(": ");
    if (i < 0) return null;
    fields[line.slice(0, i)] = line.slice(i + 2);
  }
  const issuedAt = Date.parse(fields.issued ?? "");
  if (Number.isNaN(issuedAt)) return null;
  delete fields.issued;
  return { action: head.slice("Likeness: ".length), fields, issuedAt };
}
