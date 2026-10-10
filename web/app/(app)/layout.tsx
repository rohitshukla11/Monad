import { AppHeader } from "@/components/site/AppHeader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink text-white">
      <AppHeader />
      <main id="main" className="text-ink">
        {children}
      </main>
    </div>
  );
}
