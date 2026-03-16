import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { formatErrorMessage } from "./errors.js";

export function toolResult(data: object | string): CallToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

export function toolError(error: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: formatErrorMessage(error) }],
    isError: true,
  };
}
