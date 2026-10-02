import type { StreamClient } from "@stream-io/node-sdk";
import { expect, vi, type Mock } from "vitest";
import { getTool } from "../tools/registry.js";
import type { ToolDef } from "../tools/define.js";

/** Invokes a tool's handler directly, bypassing MCP transport. */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  client: unknown
): Promise<unknown> {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return (tool as ToolDef<any>).handler(args as never, client as StreamClient);
}

/** A spy that records its single argument and resolves to `result`. */
export function spy(result: unknown = { duration: "1ms" }): Mock {
  return vi.fn().mockResolvedValue(result);
}

/** Asserts a tool rejects the given args with a message containing `needle`. */
export async function expectRejection(
  name: string,
  args: Record<string, unknown>,
  client: unknown,
  needle: string
): Promise<void> {
  await expect(callTool(name, args, client)).rejects.toThrow(needle);
}
