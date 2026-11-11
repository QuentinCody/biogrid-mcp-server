# BioGRID MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the [BioGRID](https://thebiogrid.org) REST API — the curated repository of experimentally validated protein-protein and genetic interactions, each traceable to a publication and an experimental system. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## ⚠️ Requires a free access key

**Every interaction-service endpoint** is gated behind an access key — including the `/version/`, `/organisms/`, `/identifiers/` and `/evidence/` metadata helpers, which redirect to the registration page when no key is sent. Without `BIOGRID_ACCESS_KEY` these routes return a hard failure carrying the code `BIOGRID_ACCESS_KEY_MISSING`. ORCS routes use the separate `BIOGRID_ORCS_ACCESS_KEY` described below. Neither service falls back to substitute data.

Getting the key takes about two minutes and costs nothing:

1. Open **<https://webservice.thebiogrid.org/>** and fill in *firstname*, *lastname*, *email*, *project*.
2. Click **Generate Access Key**. The 32-character key is issued inline — no approval queue, no confirmation email step.
3. Install it as a Worker secret:

   ```bash
   cd servers/biogrid-mcp-server && npx wrangler secret put BIOGRID_ACCESS_KEY
   ```

4. Redeploy so the running Worker picks the secret up:

   ```bash
   pnpm --filter biogrid-mcp-server run deploy
   ```

For local development put the key in `servers/biogrid-mcp-server/.dev.vars`:

```
BIOGRID_ACCESS_KEY=<your 32-character key>
```

Verify it end to end (this must return a real `BIOGRID_INTERACTION_ID`, not an error):

```bash
curl -s "https://webservice.thebiogrid.org/interactions/?accesskey=$BIOGRID_ACCESS_KEY&geneList=TP53&searchNames=true&taxId=9606&max=1&format=json"
```

## Connect

The server is deployed at:

```
https://biogrid-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "biogrid": {
      "command": "npx",
      "args": ["mcp-remote", "https://biogrid-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8897/mcp` (start it with `./scripts/dev-servers.sh biogrid`).

## Tools

- `biogrid_search` — discover interaction and ORCS API operations (Code Mode catalog search)
- `biogrid_execute` — **Code Mode**: write JavaScript in a V8 isolate (`api.get()` / `api.post()` / `searchSpec()`) instead of issuing tool calls one by one
- `biogrid_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `biogrid_get_schema` — inspect the inferred schema of a staged dataset

Large responses (>30KB) are auto-staged into a queryable SQLite database; the tools return a `data_access_id` you can query with SQL. Every tool returns both a human-readable `content` summary and a structured `structuredContent` payload.

## Endpoint coverage

Verified 2026-08-27 against the official WADL at <https://webservice.thebiogrid.org/application.wadl>. The REST API exposes exactly:

| Path | Category |
| --- | --- |
| `/interactions/` | interactions |
| `/interactions/{interactionId}` (WADL spells it `/interaction/{interactionId}`) | interactions |
| `/organisms/` | metadata |
| `/identifiers/` | metadata |
| `/evidence/` | metadata |
| `/version/` | metadata |

There is **no `/chemicals/` endpoint**. The catalog used to advertise one; it returns a hard nginx `404` upstream with or without a key and is absent from the WADL, so it was removed rather than left as a phantom operation the model would keep trying.

## ORCS CRISPR screens

The [ORCS REST service](https://wiki.thebiogrid.org/doku.php/orcs:webservice) uses `https://orcsws.thebiogrid.org` and its own registration/key. Install `BIOGRID_ORCS_ACCESS_KEY` as a Worker secret or local `.dev.vars` entry. It is independent of `BIOGRID_ACCESS_KEY`; either service can be configured alone. Credentials are injected by the host and are never returned to Code Mode.

| Adapter path | Data |
| --- | --- |
| `/orcs/organisms/` | Supported organisms |
| `/orcs/vocabs/`, `/orcs/vocab/{vocab_id}` | Controlled vocabularies and terms |
| `/orcs/screens/` | Screen metadata; `start`/`max` pagination, organism/publication and vocabulary filters |
| `/orcs/screen/{screen_id}` | Scores for a screen, optionally filtered by gene, hit status and score bounds |
| `/orcs/screen/{screen_id}/context` | Adapter join of scores with exactly one matching screen metadata record |
| `/orcs/gene/{gene_id}`, `/orcs/genes/` | Gene scores across screens |

```javascript
const result = await api.get("/orcs/screen/{screen_id}/context", {
  screen_id: "201", geneID: "5977", hit: "all"
});
// Large results stage automatically. Long metadata may be omitted from the
// staging envelope; this compact lookup remains available.
const context = result.screen_context ?? await api.get(
  result.screen_context_request.path, result.screen_context_request.params
);
return { result, context };
```

Identifiers above come from the [provider's historical Python example](https://github.com/BioGRID/ORCS-REST-EXAMPLES), not a claim about the current release. Preserve `SCREEN_ID`, cell line, experimental setup, score definitions and significance criteria when interpreting scores. Fields such as `SCORE.1` keep their original strings and `-` missing markers. ORCS scores are complementary evidence to DepMap and cannot be substituted for its dependency values. The provider may ignore invalid vocabulary terms or filters for annotations a screen lacks; inspect the returned context.

Screen discovery defaults to 100 rows, permits at most 10,000 per page, and supports bounded offset pagination. Score endpoints have no documented pagination: responses above 16MB fail with advice to narrow filters or process bulk data externally. HTTP-200 provider error objects are failures, including invalid access keys.

Validation on 2026-09-27: local MCP discovery and missing-key contracts pass; controlled fixtures exercise score preservation, context joins, pagination and automatic staging. Authenticated upstream success and actual ORCS staging remain unverified because no local ORCS key is configured. The public [ORCS download listing](https://downloads.thebiogrid.org/BioGRID-ORCS/Current-Release/) advertises ORCS 2.0.18 compiled September 9, 2025; the July 2026 news item is a general BioGRID release, not an ORCS release. Direct archive probes returned HTTP 403 in this environment; bulk files are not ingested by this adapter.

## Keyless bulk downloads — measured, and deliberately not implemented

BioGRID publishes MIT-licensed bulk files at <https://downloads.thebiogrid.org/BioGRID/Latest-Release/> with no key. They are **not** a substitute for the REST key, and only one of them would fit inside a Worker isolate. Sizes below were read from the release listing on 2026-08-27 (release 5.0.260); the chemicals figures were measured by downloading the file.

| File | Compressed | Expanded | Verdict for a Worker |
| --- | --- | --- | --- |
| `BIOGRID-ALL-LATEST.tab3.zip` (full interaction corpus) | 172.59 MB | ~1.4 GB | **No** — an order of magnitude past the 128 MB isolate |
| `BIOGRID-ORGANISM-LATEST.tab3.zip` (per-organism, 98 members) | 178.23 MB | ~1.5 GB | **No** — there is no standalone *Homo sapiens* download; the human member is only reachable by fetching the whole archive |
| `BIOGRID-ORCS-ALL-homo_sapiens-LATEST.screens.tar.gz` (CRISPR screens) | 717.79 MB | larger | **No** |
| `BIOGRID-CORONAVIRUS-LATEST.tab3.zip` | 4.26 MB | ~45 MB | Borderline |
| `BIOGRID-CHEMICALS-LATEST.chemtab.zip` | 1,370,068 bytes | 13,497,004 bytes / 31,540 rows | Would fit — but covers ~1% of BioGRID |

The bulk host also **ignores HTTP `Range`** (both `bytes=0-99` and the suffix probe return `200` with no `content-range`), and it sends no `Content-Length` at all — responses are chunked. So the repo's ZIP-over-HTTP central-directory reader (`servers/cms-formulary-mcp-server/src/lib/zip-directory.ts`) cannot pull a single member out of the large archives, and the whole file must be transferred to read any of it. The host additionally rate-limits aggressively (`429` on consecutive probes).

The chemicals file is the only viable candidate, and it is not implemented here on purpose: it carries ~31.5K chemical-protein edges out of BioGRID's ~2.9M interactions — none of the protein-protein, genetic-interaction, PTM or CRISPR-screen content this server exists for. Shipping it would make the server look green while the actual database stayed unreachable. If it is ever built it must be an **additional** capability with its own probe, never a replacement for the `/interactions/` path.

If you need keyless human protein-protein edges today, use the **string-db** MCP server — note it returns combined evidence scores, not BioGRID's per-publication PubMed IDs or experimental-system labels, and it has no genetic-interaction, PTM or ORCS content.

## Development

```bash
./scripts/dev-servers.sh biogrid              # run locally (port 8897)
pnpm --filter biogrid-mcp-server run type-check
pnpm --filter biogrid-mcp-server run lint
pnpm --filter biogrid-mcp-server run test:regression
pnpm --filter biogrid-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from BioGRID and stays under the terms of that source: MIT.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
