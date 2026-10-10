/**
 * Marketing copy that is data, not code. Every number here is a real measurement with its source;
 * testimonials are real quotes only. An empty list hides the section entirely.
 */

export const MEASUREMENTS = {
  /** CreatorRegistry.register on Monad testnet, send to receipt over the public RPC. */
  registerMs: {
    value: 853,
    source: "CreatorRegistry.register on Monad testnet, 2026-10-06 (pnpm seed), send to receipt over the public RPC",
  },
  /** By construction: payRender anchors the receipt in the same transaction, and files are released only after it. */
  rendersWithReceipt: {
    value: 100,
    source: "LicenseEscrow.payRender anchors the receipt in the same transaction that pays the creator",
  },
} as const;

export type Testimonial = { quote: string; name: string; role: string };

/** Real, attributed quotes only. Leave empty until there are some: the section is then not rendered. */
export const TESTIMONIALS: Testimonial[] = [];

export const BUILT_ON = ["Monad", "Dynamic", "Didit", "Mera", "Envio", "Gemini", "C2PA"];
