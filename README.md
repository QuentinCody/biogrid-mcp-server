# BioGRID MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the [BioGRID](https://thebiogrid.org) REST API — the curated repository of experimentally validated protein-protein and genetic interactions, each traceable to a publication and an experimental system. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## ⚠️ Requires a free access key

**Every** BioGRID REST endpoint is gated behind an access key — including the `/version/`, `/organisms/`, `/identifiers/` and `/evidence/` metadata helpers, which redirect to the registration page when no key is sent. Without `BIOGRID_ACCESS_KEY` this server answers every query with a hard failure carrying the code `BIOGRID_ACCESS_KEY_MISSING`. It does **not** fall back to substitute data.

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

- `biogrid_search` — discover available API operations (Code Mode catalog search, 6 endpoints)
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
