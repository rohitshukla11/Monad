/** Shown while a server page reads the chain. Shapes only; no numbers until they are real. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <section className="mx-auto flex max-w-[1320px] flex-wrap items-end gap-10 px-4 pb-[84px] pt-7 sm:px-8 sm:pt-9">
        <div className="flex flex-[999_1_640px] flex-col gap-4">
          <span className="block h-16 w-3/4 animate-pulse rounded-[20px] bg-ink-raised motion-reduce:animate-none" />
          <span className="block h-16 w-1/2 animate-pulse rounded-[20px] bg-ink-raised motion-reduce:animate-none" />
        </div>
        <span className="block h-56 min-w-0 flex-[1_1_400px] animate-pulse rounded-[30px] bg-ink-raised motion-reduce:animate-none" />
      </section>
      <section className="-mt-12 rounded-t-[40px] bg-paper">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-[18px] px-4 pb-14 pt-8 sm:grid-cols-3 sm:px-8">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block h-32 animate-pulse rounded-[26px] bg-white motion-reduce:animate-none" />
          ))}
        </div>
      </section>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
