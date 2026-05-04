// interlinked-tdd: exempt
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { biogridCatalog } from "../spec/catalog";
import { createBiogridApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
	BIOGRID_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
	BIOGRID_ACCESS_KEY?: string;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
	const apiFetch = createBiogridApiFetch({ BIOGRID_ACCESS_KEY: env.BIOGRID_ACCESS_KEY });

	const searchTool = createSearchTool({
		prefix: "biogrid",
		catalog: biogridCatalog,
	});
	searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

	const executeTool = createExecuteTool({
		prefix: "biogrid",
		catalog: biogridCatalog,
		apiFetch,
		doNamespace: env.BIOGRID_DATA_DO,
		loader: env.CODE_MODE_LOADER,
	});
	executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
