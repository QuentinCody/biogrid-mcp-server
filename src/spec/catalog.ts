// interlinked-tdd: exempt
import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

/**
 * BioGRID REST API catalog.
 *
 * BioGRID (the Biological General Repository for Interaction Datasets) is the
 * canonical curated repository of experimentally validated protein-protein,
 * genetic, and chemical-protein interactions. v4.4+ covers ~80,000 publications
 * spanning ~2.4M interactions across 80+ model organisms. This complements
 * STRING (which is computational/predicted) and IntAct/MINT (PSI-MI Mol-Inter
 * member DBs).
 *
 * Auth: every request requires `accesskey=<32-char-key>` (free registration at
 * https://webservice.thebiogrid.org). The host HTTP layer injects this from
 * the `BIOGRID_ACCESS_KEY` Worker secret — Code Mode never sees it.
 *
 * Response format: when `format=json` (the default in the adapter when
 * unspecified), interactions endpoints return an OBJECT keyed by BioGRID
 * interaction id. The api-adapter rewrites this into an ARRAY before staging.
 */
const PAGE_SIZE_HINT =
	"Default 10,000 records per request, max 10,000 (use start= for offset pagination).";

export const biogridCatalog: ApiCatalog = {
	name: "BioGRID REST",
	baseUrl: "https://webservice.thebiogrid.org",
	version: "4.4",
	auth: "required",
	endpointCount: 8,
	notes:
		"- AUTH: every request needs `accesskey` — host HTTP layer injects it from BIOGRID_ACCESS_KEY secret. Do NOT pass `accesskey` in api.get(...) params.\n" +
		"- Always set `format=json` for structured access (default upstream is `tab2`). The adapter requests JSON via `Accept: application/json` but the upstream defers to the `format` query param.\n" +
		"- `geneList`: pipe-separated gene names (e.g. `MDM2|TP53`). Paired with `searchNames=true` for symbol search, `searchIds=true` for Entrez/UniProt, `searchSynonyms=true` for legacy aliases.\n" +
		"- `taxId`: NCBI taxonomy ID (`9606` human, `10090` mouse, `6239` C. elegans). Default `All`. Use `interSpeciesExcluded=true` to drop cross-species rows.\n" +
		"- `evidenceList`: pipe-separated experiment types (e.g. `Affinity Capture-MS|Two-hybrid`). Get the full list from `/evidence/`.\n" +
		"- `pubmedList`: pipe-separated PubMed IDs to filter to specific publications.\n" +
		"- `additionalIdentifierTypes`: pipe-separated ID systems for `geneList` (UNIPROT|REFSEQ|ENSEMBL|SYSTEMATIC NAME). Default Entrez gene + symbol.\n" +
		"- `includeInteractors=true` returns first-order partners; `includeInteractorInteractions=true` adds the partner-partner edges.\n" +
		"- `selfInteractionsExcluded=true` drops homodimers.\n" +
		`- ${PAGE_SIZE_HINT}\n` +
		"- The adapter normalizes `/interactions/` JSON-object responses (keyed by BioGRID id) into arrays so SQL staging works cleanly.\n" +
		"- Use `format=count` (no rows, returns row count only) to size queries before pulling.\n" +
		"- BioGRID errors return JSON `{STATUS, MESSAGES, TYPE}` — the adapter surfaces these via the standard non-2xx error path.",
	endpoints: [
		// ── interactions ──────────────────────────────────────────────
		{
			method: "GET",
			path: "/interactions/",
			summary:
				"Search interactions across the full BioGRID corpus. Combine geneList + taxId + evidenceList + pubmedList to filter.",
			category: "interactions",
			queryParams: [
				{
					name: "format",
					type: "string",
					required: false,
					description:
						"Response format. Use `json` for structured access, `jsonExtended` for richer columns, `count` to just get the row count.",
					enum: ["tab1", "tab2", "extendedTab2", "json", "jsonExtended", "count"],
					default: "json",
				},
				{
					name: "geneList",
					type: "string",
					required: false,
					description:
						"Pipe-separated gene names or identifiers (e.g. `MDM2|TP53`). Required for most useful queries.",
				},
				{
					name: "searchNames",
					type: "boolean",
					required: false,
					description: "Match `geneList` entries against official gene symbols.",
				},
				{
					name: "searchIds",
					type: "boolean",
					required: false,
					description: "Match `geneList` entries against Entrez/UniProt/RefSeq IDs.",
				},
				{
					name: "searchSynonyms",
					type: "boolean",
					required: false,
					description: "Match `geneList` against legacy/synonym symbols.",
				},
				{
					name: "additionalIdentifierTypes",
					type: "string",
					required: false,
					description:
						"Pipe-separated identifier systems for `geneList` (UNIPROT|REFSEQ|ENSEMBL|SYSTEMATIC NAME).",
				},
				{
					name: "taxId",
					type: "string",
					required: false,
					description:
						"NCBI taxonomy ID (`9606` human, `10090` mouse, `6239` C. elegans). Use `All` for cross-organism.",
					default: "All",
				},
				{
					name: "interSpeciesExcluded",
					type: "boolean",
					required: false,
					description: "Drop cross-species interactions.",
				},
				{
					name: "selfInteractionsExcluded",
					type: "boolean",
					required: false,
					description: "Drop homodimers (gene-A == gene-B).",
				},
				{
					name: "evidenceList",
					type: "string",
					required: false,
					description:
						"Pipe-separated experiment types. Combine with `includeEvidence=true` to require a match (default behavior is to exclude listed types).",
				},
				{
					name: "includeEvidence",
					type: "boolean",
					required: false,
					description: "When true, only include rows whose evidence matches `evidenceList`.",
				},
				{
					name: "pubmedList",
					type: "string",
					required: false,
					description:
						"Pipe-separated PubMed IDs. Combine with `includePubmed=true` to require a match.",
				},
				{
					name: "includePubmed",
					type: "boolean",
					required: false,
					description: "When true, only include rows whose PMID matches `pubmedList`.",
				},
				{
					name: "includeInteractors",
					type: "boolean",
					required: false,
					description: "Add first-order partners of every gene in `geneList`.",
				},
				{
					name: "includeInteractorInteractions",
					type: "boolean",
					required: false,
					description: "Add partner-partner edges (requires `includeInteractors=true`).",
				},
				{
					name: "includeHeader",
					type: "boolean",
					required: false,
					description: "Add a header row to tab/extended responses.",
				},
				{
					name: "max",
					type: "number",
					required: false,
					description: "Records per page, max 10,000.",
					default: 10_000,
				},
				{
					name: "start",
					type: "number",
					required: false,
					description: "Offset for pagination.",
					default: 0,
				},
			],
		},
		{
			method: "GET",
			path: "/interactions/{interactionId}",
			summary: "Fetch a single interaction by BioGRID interaction ID.",
			category: "interactions",
			pathParams: [
				{
					name: "interactionId",
					type: "string",
					required: true,
					description: "BioGRID interaction ID (numeric).",
				},
			],
			queryParams: [
				{
					name: "format",
					type: "string",
					required: false,
					description: "Response format.",
					enum: ["tab1", "tab2", "extendedTab2", "json", "jsonExtended"],
					default: "json",
				},
			],
		},

		// ── metadata helpers ─────────────────────────────────────────
		{
			method: "GET",
			path: "/organisms/",
			summary:
				"List supported organism taxonomy IDs and names. Returned as a JSON object keyed by taxId.",
			category: "metadata",
			queryParams: [
				{
					name: "format",
					type: "string",
					required: false,
					description: "Response format.",
					enum: ["tab1", "json"],
					default: "json",
				},
			],
		},
		{
			method: "GET",
			path: "/identifiers/",
			summary: "List supported identifier types accepted in `additionalIdentifierTypes`.",
			category: "metadata",
			queryParams: [
				{
					name: "format",
					type: "string",
					required: false,
					description: "Response format.",
					enum: ["tab1", "json"],
					default: "json",
				},
			],
		},
		{
			method: "GET",
			path: "/evidence/",
			summary: "List supported experimental evidence types accepted in `evidenceList`.",
			category: "metadata",
			queryParams: [
				{
					name: "format",
					type: "string",
					required: false,
					description: "Response format.",
					enum: ["tab1", "json"],
					default: "json",
				},
			],
		},
		{
			method: "GET",
			path: "/version/",
			summary: "Current BioGRID database release version.",
			category: "metadata",
		},
		// ── chemicals ───────────────────────────────────────────────
		{
			method: "GET",
			path: "/chemicals/",
			summary:
				"Search chemical-protein interactions. Returns chemical:protein edges from BioGRID's chemical interaction dataset (overlay of CTD, DrugBank, and curated assays).",
			category: "chemicals",
			queryParams: [
				{
					name: "format",
					type: "string",
					required: false,
					description: "Response format.",
					enum: ["tab2", "extendedTab2", "json", "jsonExtended", "count"],
					default: "json",
				},
				{
					name: "geneList",
					type: "string",
					required: false,
					description: "Pipe-separated gene symbols / IDs to query for chemical interactors.",
				},
				{
					name: "chemicalList",
					type: "string",
					required: false,
					description: "Pipe-separated chemical names or IDs.",
				},
				{
					name: "chemicalType",
					type: "string",
					required: false,
					description: "Restrict to a chemical ID system.",
					enum: ["BIOGRID", "CHEBI", "DRUGBANK", "PUBCHEM"],
				},
				{
					name: "taxId",
					type: "string",
					required: false,
					description: "NCBI taxonomy ID (e.g. `9606`).",
					default: "All",
				},
				{
					name: "max",
					type: "number",
					required: false,
					description: "Records per page, max 10,000.",
					default: 10_000,
				},
				{
					name: "start",
					type: "number",
					required: false,
					description: "Offset for pagination.",
					default: 0,
				},
			],
		},
	],
};
