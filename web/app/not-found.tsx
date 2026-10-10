import type { Metadata } from "next";
import Link from "next/link";
import { NoticePage, pillClass } from "@/components/ds";
import { AppHeader } from "@/components/site/AppHeader";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="min-h-screen bg-ink text-white">
      <AppHeader />
      <main id="main" className="text-ink">
        <NoticePage
          title="Nothing here"
          kicker="404"
          action={
            <div className="flex flex-wrap gap-3">
              <Link href="/market" className={pillClass("ink")}>
                Browse creators
              </Link>
              <Link href="/" className={pillClass("outline")}>
                Home
              </Link>
            </div>
          }
        >
          That page does not exist. If you followed a link to a creator or a licence, check the address.
        </NoticePage>
      </main>
    </div>
  );
}
