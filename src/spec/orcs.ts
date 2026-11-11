import type { ApiEndpoint, ParamDef, WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";
import { ORCS_VOCAB_FILTERS } from "../lib/orcs-request";

const hit: ParamDef = { name: "hit", type: "string", required: false, enum: ["yes", "no", "all"], description: "Provider significance flag; ignored if a screen has no significance annotation. Preserve SIGNIFICANCE_CRITERIA." };
const scores: ParamDef[] = [hit, ...Array.from({ length: 5 }, (_, i) => i + 1).flatMap(i => ["Min", "Max"].map((bound): ParamDef => ({
  name: `score${i}${bound}`, type: "number", required: false,
  description: `${bound === "Min" ? "Lower" : "Upper"} inclusive bound for SCORE.${i}, in that screen's units; ignored if the score column is absent.`,
})))];
const geneFilters: ParamDef[] = [
  { name: "geneID", type: "string", required: false, description: "Pipe-separated IDENTIFIER_ID gene identifiers, e.g. 1021|1022; does not select ambiguous/unknown identifier types" },
  { name: "name", type: "string", required: false, description: "Pipe-separated official gene symbols, e.g. CDK6|TP53" },
];
const organism: ParamDef = { name: "organismID", type: "string", required: false, description: "Pipe-separated organism IDs from /orcs/organisms/; invalid IDs may be ignored upstream" };
const screenFilters: ParamDef[] = [...scores, ...geneFilters,
  { name: "idType", type: "string", required: false, description: "Pipe-separated gene|unknown|ambiguous identifier types" },
];
const screenId: ParamDef[] = [{ name: "screen_id", type: "string", required: true, description: "Positive ORCS SCREEN_ID from screen discovery, e.g. 201; not a DepMap model identifier" }];

export const orcsEndpoints: ApiEndpoint[] = [
  { method: "GET", path: "/orcs/organisms/", category: "orcs", summary: "Discover organism IDs supported by BioGRID ORCS CRISPR screens" },
  { method: "GET", path: "/orcs/vocabs/", category: "orcs", summary: "Discover ORCS controlled-vocabulary categories for screen filtering" },
  { method: "GET", path: "/orcs/vocab/{vocab_id}", category: "orcs", summary: "Get valid ORCS vocabulary terms; category 10 is cell lines",
    pathParams: [{ name: "vocab_id", type: "string", required: true, description: "Positive category ID returned by /orcs/vocabs/" }] },
  { method: "GET", path: "/orcs/screens/", category: "orcs", featured: true,
    summary: "Discover CRISPR screen metadata with cell line, conditions, library, score definitions and significance criteria; offset-paginated",
    queryParams: [
      { name: "start", type: "number", required: false, description: "Zero-based offset", default: 0 },
      { name: "max", type: "number", required: false, description: "Page size 1–10000; retain pagination scope", default: 100 },
      { name: "screenID", type: "string", required: false, description: "Pipe-separated ORCS screen IDs" },
      { name: "pubmedID", type: "string", required: false, description: "Pipe-separated PubMed IDs" }, organism,
      ...Object.entries(ORCS_VOCAB_FILTERS).map(([name, id]): ParamDef => ({ name, type: "string", required: false,
        description: `Pipe-separated terms from /orcs/vocab/${id}; invalid terms may be silently ignored by ORCS. Verify returned screen context.` })),
    ], usageHint: "Rows are under data. For bounded offset pagination use api.getAll with itemsField:'data', offsetParam:'start', limitParam:'max'. A page is not the complete catalogue. The provider ignores invalid vocabulary filters." },
  { method: "GET", path: "/orcs/screen/{screen_id}", category: "orcs", summary: "Read gene scores from one ORCS screen; pair with /orcs/screens/?screenID=... for interpretation", pathParams: screenId, queryParams: screenFilters },
  { method: "GET", path: "/orcs/screen/{screen_id}/context", category: "orcs", featured: true,
    summary: "Adapter operation: join a screen's score rows with its exact screen metadata, preserving cell line, score units and significance criteria",
    pathParams: screenId, queryParams: screenFilters,
    usageHint: "Returns screen_context plus data score rows. Rejects missing/ambiguous metadata or mismatched SCREEN_ID rows. Scores remain strings, including '-' missing values. Large results stage automatically; if screen_context is omitted from the staging envelope, use api.get(screen_context_request.path, screen_context_request.params) to retrieve it. Narrower gene/hit filters may be needed above 16MB." },
  { method: "GET", path: "/orcs/gene/{gene_id}", category: "orcs", summary: "Read one gene's scores across ORCS screens; use SCREEN_ID to fetch each screen's context before comparing scores",
    pathParams: [{ name: "gene_id", type: "string", required: true, description: "Positive ORCS gene IDENTIFIER_ID, e.g. 1021" }], queryParams: scores },
  { method: "GET", path: "/orcs/genes/", category: "orcs", summary: "Read scores for genes across ORCS screens; requires geneID or name and retains per-screen score columns",
    queryParams: [...geneFilters, organism, ...scores] },
];

export const orcsWorkflows: WorkflowRecipe[] = [
  { title: "Discover HeLa knockout screen context", description: "Read a bounded ORCS screen page using the provider's documented vocabulary example; inspect returned context before interpreting the filter.", keywords: ["ORCS", "CRISPR", "HeLa", "screen", "cell line"],
    code: 'return await api.get("/orcs/screens/",{cellLine:"hela",libraryMethodology:"knockout",max:25,start:0});' },
  { title: "Read gene scores with the source screen's scoring context", description: "Provider example identifiers: ORCS screen 201 and gene 5977. Retain the returned cell line, score definitions and significance rule; do not substitute this score for a current DepMap dependency value.", keywords: ["ORCS", "DepMap", "CERES", "score", "context"],
    code: 'return await api.get("/orcs/screen/{screen_id}/context",{screen_id:"201",geneID:"5977",hit:"all"});' },
];
