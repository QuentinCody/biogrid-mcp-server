import { z } from "zod";

export const ORCS_VOCAB_FILTERS = {
  screenType: 2, throughput: 1, experimentalSetup: 3, conditionName: 4,
  libraryName: 5, libraryType: 6, libraryMethodology: 7, screenFormat: 8,
  enzyme: 9, cellLine: 10, cellType: 11, phenotype: 12, statisticalAnalysis: 15,
};
const text = z.string().trim().min(1).max(2000);
const ids = text.regex(/^[1-9]\d*(\|[1-9]\d*)*$/);
const base = z.object({ format: z.literal("json").optional() });
const scoreBounds = Object.fromEntries(Array.from({ length: 5 }, (_, i) => i + 1)
  .flatMap(i => ["Min", "Max"].map(bound => [`score${i}${bound}`, z.number().finite().optional()])));
const scores = base.extend({ hit: z.enum(["yes", "no", "all"]).optional(), ...scoreBounds });
const genes = { geneID: ids.optional(), name: text.optional() };
const screens = base.extend({
  start: z.number().int().min(0).max(2_147_483_647).optional(),
  max: z.number().int().min(1).max(10_000).default(100),
  screenID: ids.optional(), organismID: ids.optional(), pubmedID: ids.optional(),
  ...Object.fromEntries(Object.keys(ORCS_VOCAB_FILTERS).map(key => [key, text.optional()])),
});

export interface OrcsRequest {
  path: string;
  params: Record<string, unknown>;
  contextId?: string;
}

/** Only documented read routes and filters; credentials are supplied by the host. */
export function buildOrcsRequest(path: string, params: Record<string, unknown> = {}): OrcsRequest {
  const route = path.match(/^\/orcs\/(organisms|vocabs|screens|genes)\/?$/);
  const item = path.match(/^\/orcs\/(vocab|screen|gene)\/([1-9]\d*)(\/context)?\/?$/);
  if (!route && !item) throw Object.assign(new Error("Unknown ORCS route"), { status: 404 });
  const kind = route?.[1] ?? item?.[1];
  if (item?.[3] && kind !== "screen") throw new Error("Context is supported only for a screen");
  let schema = base.strict();
  if (kind === "screens") schema = screens.strict();
  if (kind === "screen") schema = scores.extend({ ...genes, idType: text.regex(/^(gene|unknown|ambiguous)(\|(gene|unknown|ambiguous))*$/).optional() }).strict();
  if (kind === "gene") schema = scores.strict();
  if (kind === "genes") schema = scores.extend({ ...genes, organismID: ids.optional() }).strict();
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw Object.assign(new Error(`Invalid ORCS parameters: ${parsed.error.message}`), { status: 400 });
  const query: Record<string, unknown> = parsed.data;
  if (kind === "genes" && !query.geneID && !query.name) throw new Error("ORCS genes requires geneID or name");
  return { path: item ? `/${kind}/${item[2]}` : `/${kind}/`, params: { ...query, format: "json" },
    ...(item?.[3] ? { contextId: item[2] } : {}) };
}
