// interlinked-tdd: exempt
import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

/**
 * BioGRID staging DO. Handles three response shapes that come back through
 * the api-adapter:
 *
 * - Interactions endpoints — array of interaction records (api-adapter
 *   normalizes the keyed-by-id object into an array). Each record has
 *   ENTREZ_GENE_A/B, OFFICIAL_SYMBOL_A/B, EXPERIMENTAL_SYSTEM, etc.
 * - `/organisms/` — keyed-by-NCBI-taxId object: {"9606": "Homo sapiens", ...}
 *   The base `detectArrays()` does not unwrap this shape, so a fetch override
 *   is not needed; we just hint sensible names when the array IS an array.
 * - `/identifiers/` and `/evidence/` — small arrays of strings.
 */
const INTERACTION_FIELDS = [
	"OFFICIAL_SYMBOL_A",
	"OFFICIAL_SYMBOL_B",
	"ENTREZ_GENE_A",
	"ENTREZ_GENE_B",
];
const ENTITY_KEY = "object";

export class BiogridDataDO extends RestStagingDO {
	protected getSchemaHints(data: unknown): SchemaHints | undefined {
		if (!data || typeof data !== ENTITY_KEY) return undefined;
		if (Array.isArray(data)) {
			const sample = data[0];
			if (sample && typeof sample === ENTITY_KEY) {
				const s = sample as Record<string, unknown>;
				const looksLikeInteraction = INTERACTION_FIELDS.some(
					(field) => field in s,
				);
				if (looksLikeInteraction) {
					return {
						tableName: "interactions",
						indexes: [
							"BIOGRID_INTERACTION_ID",
							"OFFICIAL_SYMBOL_A",
							"OFFICIAL_SYMBOL_B",
							"ENTREZ_GENE_A",
							"ENTREZ_GENE_B",
							"EXPERIMENTAL_SYSTEM",
							"PUBMED_ID",
						],
					};
				}
			}
		}
		return undefined;
	}
}
