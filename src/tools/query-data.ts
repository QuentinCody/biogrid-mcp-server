// interlinked-tdd: exempt
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createQueryDataHandler } from "@bio-mcp/shared/staging/utils";

interface QueryEnv {
	BIOGRID_DATA_DO?: unknown;
}

const MAX_LIMIT = 10000;
const DEFAULT_LIMIT = 100;

export function registerQueryData(server: McpServer, env?: QueryEnv): void {
	const handler = createQueryDataHandler("BIOGRID_DATA_DO", "biogrid");

	server.registerTool(
		"biogrid_query_data",
		{
			title: "Query Staged BioGRID Data",
			description:
				"Query staged BioGRID interaction data using SQL. Use this when responses are too large and have been staged with a data_access_id.",
			inputSchema: {
				data_access_id: z.string().min(1).describe("Data access ID for the staged dataset"),
				sql: z.string().min(1).describe("SQL query to execute against the staged data"),
				limit: z
					.number()
					.int()
					.positive()
					.max(MAX_LIMIT)
					.default(DEFAULT_LIMIT)
					.optional()
					.describe(`Maximum number of rows to return (default: ${DEFAULT_LIMIT})`),
			},
		},
		async (args, extra) => {
			const runtimeEnv = env || (extra as { env?: QueryEnv })?.env || {};
			return handler(args as Record<string, unknown>, runtimeEnv as Record<string, unknown>);
		},
	);
}
