// Minimal stdio client for the shadcn MCP server configured in .mcp.json.
// Usage: node scripts/shadcn-mcp.mjs list-tools
//        node scripts/shadcn-mcp.mjs call <toolName> '<json args>'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../.mcp.json", import.meta.url), "utf8")).mcpServers.shadcn;
const isWindows = process.platform === "win32";
const transport = new StdioClientTransport({
  command: isWindows ? "cmd" : config.command,
  args: isWindows ? ["/c", config.command, ...config.args] : config.args,
  cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  stderr: "ignore",
});
const client = new Client({ name: "carewindow-cli", version: "1.0.0" });
await client.connect(transport);
const [, , command, toolName, rawArgs] = process.argv;
try {
  if (command === "list-tools") {
    const { tools } = await client.listTools();
    for (const tool of tools) console.log(`${tool.name}: ${tool.description?.split("\n")[0]}\n  args: ${JSON.stringify(tool.inputSchema?.properties ?? {})}`);
  } else if (command === "call") {
    const result = await client.callTool({ name: toolName, arguments: rawArgs ? JSON.parse(rawArgs) : {} });
    for (const part of result.content ?? []) console.log(part.type === "text" ? part.text : JSON.stringify(part));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} finally {
  await client.close();
}
