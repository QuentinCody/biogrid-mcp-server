import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { z } from "zod";
import { buildOrcsRequest, type OrcsRequest } from "./orcs-request";

const BASE = "https://orcsws.thebiogrid.org";
const MAX_BYTES = 16_000_000;
const rowsSchema = z.array(z.record(z.string(), z.unknown()));
type Rows = z.infer<typeof rowsSchema>;

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw Object.assign(new Error(`ORCS HTTP ${response.status}`), { status: response.status });
  if (!response.body) throw new Error("ORCS returned no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return JSON.parse(text + decoder.decode());
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("ORCS response exceeds 16MB; narrow gene/hit filters or use external bulk downloads");
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
}

async function fetchRows(key: string, request: OrcsRequest): Promise<Rows> {
  const url = new URL(request.path, BASE);
  for (const [name, value] of Object.entries(request.params)) if (value !== undefined) url.searchParams.set(name, String(value));
  url.searchParams.set("accesskey", key);
  const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  const data = await readJson(response);
  // The real unauthenticated endpoint returns HTTP 200 with STATUS:ERROR.
  if (data && typeof data === "object" && "STATUS" in data && data.STATUS === "ERROR") {
    const message = "MESSAGE" in data ? String(data.MESSAGE) : "Provider rejected the request";
    throw Object.assign(new Error(`ORCS: ${message}`), { status: /access key/i.test(message) ? 401 : 502 });
  }
  return rowsSchema.parse(data);
}

async function screenWithContext(key: string, request: OrcsRequest): Promise<Record<string, unknown>> {
  const id = request.contextId;
  const [metadata, scores] = await Promise.all([
    fetchRows(key, { path: "/screens/", params: { screenID: id, max: 2, format: "json" } }),
    fetchRows(key, request),
  ]);
  if (metadata.length !== 1 || String(metadata[0].SCREEN_ID) !== id) {
    throw new Error("ORCS screen context was missing, ambiguous, or did not match the requested screen");
  }
  if (scores.some(row => String(row.SCREEN_ID) !== id)) throw new Error("ORCS score rows did not match the requested screen");
  return { screen_id: id, screen_context: metadata[0],
    screen_context_request: { path: "/orcs/screens/", params: { screenID: id, max: 1 } }, data: scores };
}

/** A separate ORCS credential stays in the host; it never enters Code Mode data. */
export function createOrcsApiFetch(rawKey?: string): ApiFetchFn {
  const key = rawKey?.trim();
  return async request => {
    if (request.method !== "GET") throw Object.assign(new Error("ORCS discovery and score access require GET"), { status: 405 });
    const parsed = buildOrcsRequest(request.path, request.params);
    if (!key) throw Object.assign(new Error("BIOGRID_ORCS_ACCESS_KEY is not configured. Register at https://orcsws.thebiogrid.org/ and install it as a Worker secret; no ORCS request was sent."), { status: 401 });
    try {
      const result = parsed.contextId ? await screenWithContext(key, parsed) : { data: await fetchRows(key, parsed) };
      return { status: 200, data: { ...result, source: "BioGRID ORCS", source_url: `${BASE}${parsed.path}`,
        filters: parsed.params, retrieved_at: new Date().toISOString(),
        interpretation: "Scores retain provider units and missing-value markers. Vocabulary terms may be ignored upstream if invalid. Hit/score filters can be ignored when the screen lacks that annotation. Compare only with the associated screen context; not interchangeable with DepMap scores.",
      } };
    } catch (error) {
      const record = error && typeof error === "object" ? error : undefined;
      const status = record && "status" in record && typeof record.status === "number" ? record.status : 502;
      const message = record && "message" in record ? String(record.message) : String(error);
      throw Object.assign(new Error(message.split(key).join("[REDACTED]").slice(0, 600)), { status });
    }
  };
}
