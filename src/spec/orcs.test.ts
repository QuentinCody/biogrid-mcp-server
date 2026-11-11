/// <reference types="node" />
import { runInNewContext } from "node:vm";
import { paginateAll } from "@bio-mcp/shared/codemode/paginate";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { afterEach, expect, it, vi } from "vitest";
import { createBiogridApiFetch } from "../lib/api-adapter";
import { biogridCatalog } from "./catalog";
import { orcsWorkflows } from "./orcs";

afterEach(() => vi.unstubAllGlobals());

it("executes both ORCS recipes through the real catalog proxy with separate credentials", async () => {
  const urls: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
    const url = new URL(String(input)); urls.push(url);
    return Response.json(url.pathname === "/screens/"
      ? [{ SCREEN_ID: "201", CELL_LINE: "U-343 MG-A cell", "SCORE.1_TYPE": "CERES score" }]
      : [{ SCREEN_ID: "201", IDENTIFIER_ID: "5977", "SCORE.1": "-0.492155932", "SCORE.3": "-" }]);
  }));
  // SAFETY: small fixtures never request staging or session capabilities.
  const proxy = createApiProxyTool({ catalog: biogridCatalog, apiFetch: createBiogridApiFetch({ BIOGRID_ORCS_ACCESS_KEY: "orcs-fixture-key" }), doNamespace: {} as DurableObjectNamespace, stagingPrefix: "biogrid" });
  // SAFETY: these bounded reads do not use ToolContext capabilities.
  const context = {} as Parameters<typeof proxy.handler>[1];
  const api = { get: (path: string, params: Record<string, unknown>) => proxy.handler({ method: "GET", path, params }, context) };
  const discovery = await runInNewContext(`(async()=>{${orcsWorkflows[0].code}})()`, { api });
  expect(discovery.data[0].SCREEN_ID).toBe("201");
  expect(urls[0].searchParams.get("cellLine")).toBe("hela");
  expect(urls[0].searchParams.get("max")).toBe("25");
  const result = await runInNewContext(`(async()=>{${orcsWorkflows[1].code}})()`, { api });
  expect(result).toMatchObject({ screen_context: { CELL_LINE: "U-343 MG-A cell", "SCORE.1_TYPE": "CERES score" }, data: [{ "SCORE.1": "-0.492155932", "SCORE.3": "-" }] });
  expect(urls.every(url => url.hostname === "orcsws.thebiogrid.org" && url.searchParams.get("accesskey") === "orcs-fixture-key")).toBe(true);
  await expect(createBiogridApiFetch({ BIOGRID_ORCS_ACCESS_KEY: "orcs-fixture-key" })({ method: "GET", path: "/version/" })).rejects.toThrow("BIOGRID_ACCESS_KEY");
});

it("keeps an offset-capped screen listing incomplete", async () => {
  const fetcher = vi.fn(async (input: URL) => {
    expect(input.searchParams.get("start")).toBe("0");
    expect(input.searchParams.get("max")).toBe("2");
    return Response.json([{ SCREEN_ID: "17" }, { SCREEN_ID: "201" }]);
  });
  vi.stubGlobal("fetch", fetcher);
  const adapter = createBiogridApiFetch({ BIOGRID_ORCS_ACCESS_KEY: "orcs-fixture-key" });
  const page = await paginateAll(async params => (await adapter({ method: "GET", path: "/orcs/screens/", params })).data, {},
    { strategy: "offset", offsetParam: "start", limitParam: "max", itemsField: "data", pageSize: 2, maxPages: 1 });
  expect(page.completeness).toMatchObject({ complete: false, returned: 2 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("retains a screen context lookup when automatic staging omits long metadata", async () => {
  const metadata = { SCREEN_ID: "201", CELL_LINE: "fixture cell", SIGNIFICANCE_CRITERIA: "long criterion ".repeat(150) };
  const scores = Array.from({ length: 700 }, (_, i) => ({ SCREEN_ID: "201", IDENTIFIER_ID: String(i), "SCORE.1": "-0.492155932", "SCORE.3": "-" }));
  vi.stubGlobal("fetch", vi.fn(async (url: URL) => Response.json(url.pathname === "/screens/" ? [metadata] : scores)));
  const stage = vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === "/process") return Response.json({ success: true, tables_created: ["scores"], total_rows: 700, input_rows: 700, table_row_counts: { scores: 700 } });
    if (path === "/schema") return Response.json({ success: true, schema: { tables: { scores: { columns: [] } } } });
    return Response.json({ success: true });
  });
  // SAFETY: this fixture implements only the namespace capabilities the staging helper calls.
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: stage }) } as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({ catalog: biogridCatalog, apiFetch: createBiogridApiFetch({ BIOGRID_ORCS_ACCESS_KEY: "orcs-fixture-key" }), doNamespace: namespace, stagingPrefix: "biogrid" });
  const result = await proxy.handler({ method: "GET", path: "/orcs/screen/201/context" }, { sql: () => [] });
  expect(result).toMatchObject({ __staged: true, screen_id: "201", screen_context_request: { path: "/orcs/screens/", params: { screenID: "201", max: 1 } } });
  expect(result).not.toHaveProperty("screen_context");
  expect(JSON.stringify(result).length).toBeLessThan(100_000);
  const recovered = await proxy.handler({ method: "GET", path: "/orcs/screens/", params: { screenID: "201", max: 1 } }, { sql: () => [] });
  expect(recovered).toMatchObject({ data: [metadata] });
  expect(stage).toHaveBeenCalled();
});
