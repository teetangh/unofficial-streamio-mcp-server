/**
 * Starts the built server over stdio and asserts it speaks MCP correctly:
 * the tool count matches the registry, names are unique and prefixed, every
 * input schema is a valid JSON Schema object, and toolset gating works.
 *
 *   npm run build && npm run smoke
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(ROOT, "build", "index.js");
const PREFIXES = new Set(["chat", "video", "users", "auth", "moderation", "app"]);

if (!existsSync(ENTRY)) {
  console.error("build/index.js is missing — run `npm run build` first.");
  process.exit(1);
}

function listTools(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      env: {
        ...process.env,
        STREAM_API_KEY: "smoke-key",
        STREAM_API_SECRET: "smoke-secret",
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        return reject(new Error(`server exited with ${code}\n${stderr}`));
      }
      const response = stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .find((message) => message.id === 2);
      if (!response) return reject(new Error(`no tools/list response\n${stderr}`));
      resolve({ tools: response.result.tools, stderr });
    });

    const messages = [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "smoke", version: "0.0.0" },
        },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ];
    child.stdin.write(messages.map((message) => JSON.stringify(message)).join("\n") + "\n");
    child.stdin.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`ok: ${message}`);
  return true;
}

const { ALL_TOOLS } = await import(new URL("../build/tools/registry.js", import.meta.url));
const aliasCount = ALL_TOOLS.reduce((sum, tool) => sum + (tool.aliases?.length ?? 0), 0);
const expected = ALL_TOOLS.length + aliasCount;

const { tools } = await listTools();

assert(tools.length === expected, `tools/list returns ${expected} tools (got ${tools.length})`);
assert(new Set(tools.map((tool) => tool.name)).size === tools.length, "all tool names are unique");
assert(
  tools.every((tool) => PREFIXES.has(tool.name.split("_")[0])),
  "all tool names use a known prefix"
);
assert(
  tools.every((tool) => tool.inputSchema?.type === "object" && tool.inputSchema.properties),
  "all input schemas are JSON Schema objects"
);
assert(
  tools.every((tool) => tool.annotations && typeof tool.annotations.readOnlyHint === "boolean"),
  "all tools carry annotations"
);
assert(
  tools.every((tool) => "verbose" in tool.inputSchema.properties),
  "all tools accept the injected `verbose` flag"
);

// Pick a real toolset from the registry so this works whatever is registered.
const sampleToolset = ALL_TOOLS[ALL_TOOLS.length - 1].toolset;
const inToolset = new Set(
  ALL_TOOLS.filter((tool) => tool.toolset === sampleToolset).flatMap((tool) => [
    tool.name,
    ...(tool.aliases ?? []),
  ])
);
const { tools: gated } = await listTools({ STREAM_MCP_TOOLSETS: sampleToolset });
assert(
  gated.length > 0 && gated.every((tool) => inToolset.has(tool.name)),
  `STREAM_MCP_TOOLSETS=${sampleToolset} registers only that toolset`
);

const { tools: readOnly } = await listTools({ STREAM_MCP_READ_ONLY: "true" });
assert(
  readOnly.length > 0 && readOnly.every((tool) => tool.annotations.readOnlyHint === true),
  "STREAM_MCP_READ_ONLY=true registers only read-only tools"
);

const schemaBytes = Buffer.byteLength(JSON.stringify(tools));
console.log(
  `\nTool surface: ${tools.length} tools, ${(schemaBytes / 1024).toFixed(1)} KB of schema.`
);
if (process.exitCode) console.error("\nSmoke test failed.");
else console.log("Smoke test passed.");
