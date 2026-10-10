/** The History-row columns every event table carries. */
export function at(event: { block: { number: number; timestamp: number }; transaction: { hash: string }; logIndex: number; chainId: number }) {
  return {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    block: event.block.number,
    timestamp: event.block.timestamp,
    tx: event.transaction.hash,
    logIndex: event.logIndex,
  };
}

export const lower = (a: string) => a.toLowerCase();

export const FIELDS = { transaction: ["hash"], block: ["timestamp"] } as const;
