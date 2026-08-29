import { buildHealthResponse, configureCitationSigning } from "@bio-mcp/shared";
// interlinked-tdd: exempt
import { StatelessMcpWorker } from "@bio-mcp/shared/mcp";
import { McpServer } from "@bio-mcp/shared/mcp";
import { registerQueryData } from "./tools/query-data";
import { registerGetSchema } from "./tools/get-schema";
import { registerCodeMode } from "./tools/code-mode";
import { BiogridDataDO } from "./do";

export { BiogridDataDO };

interface BiogridEnv {
	BIOGRID_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
	BIOGRID_ACCESS_KEY?: string;
}

export class MyMCP extends StatelessMcpWorker {
	server = new McpServer({
		name: "biogrid",
		version: "0.1.0",
	});

	async init() {

		configureCitationSigning(this.env);
		const env = this.env as unknown as BiogridEnv;
		registerQueryData(this.server, env);
		registerGetSchema(this.server, env);
		registerCodeMode(this.server, env);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return buildHealthResponse("biogrid");
		}

		if (url.pathname === "/readyz") {
			// Deep check: builds the MCP server the way a real request does, so a
			// factory that throws is a 503 here instead of a green /health over a
			// server that 500s every MCP call.
			return MyMCP.readiness(env, "biogrid");
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
