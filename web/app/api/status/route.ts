import { json } from "@/lib/server/http";
import { integrations } from "@/lib/server/integrations";
import { isLocalFork } from "@/lib/server/chain";
import { verificationLevel } from "@/lib/server/didit";

export async function GET() {
  return json({ chain: isLocalFork() ? "local fork of Monad testnet" : "Monad testnet", verificationLevel: verificationLevel(), integrations: integrations() });
}
