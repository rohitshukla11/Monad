import { historySource } from "@/lib/server/index";
import { fail, json } from "@/lib/server/http";
import { listCreators } from "@/lib/server/protocol";

export async function GET() {
  try {
    return json({ source: historySource(), creators: await listCreators() });
  } catch (e) {
    return fail(e);
  }
}
