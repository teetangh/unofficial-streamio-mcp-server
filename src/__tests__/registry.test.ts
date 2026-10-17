import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_TOOLS, getTool } from "../tools/registry.js";
import { ALL_TOOLSETS } from "../config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("tool registry", () => {
  it("has no duplicate names", () => {
    const names = ALL_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses a known prefix for every tool", () => {
    const prefixes = new Set(["chat", "video", "users", "auth", "moderation", "app"]);
    for (const tool of ALL_TOOLS) {
      expect(prefixes, tool.name).toContain(tool.name.split("_")[0]);
    }
  });

  it("declares a valid toolset for every tool", () => {
    for (const tool of ALL_TOOLS) {
      expect(ALL_TOOLSETS, tool.name).toContain(tool.toolset);
    }
  });

  it("gives every tool a title, description and annotations", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description.length, tool.name).toBeGreaterThan(30);
      expect(tool.annotations.readOnlyHint, tool.name).toBeTypeOf("boolean");
      expect(tool.annotations.destructiveHint, tool.name).toBeTypeOf("boolean");
      expect(tool.annotations.idempotentHint, tool.name).toBeTypeOf("boolean");
    }
  });

  it("gives every input parameter a description so generated docs have no empty cells", () => {
    type SchemaNode = { description?: string; def?: { innerType?: unknown } };
    for (const tool of ALL_TOOLS) {
      for (const [param, rawSchema] of Object.entries(tool.inputSchema)) {
        let inner: SchemaNode | undefined = rawSchema as SchemaNode;
        let description = inner.description;
        for (let depth = 0; depth < 10 && !description && inner?.def?.innerType; depth += 1) {
          inner = inner.def.innerType as SchemaNode;
          description = inner?.description;
        }
        expect(description?.trim(), `${tool.name}.${param}`).toBeTruthy();
      }
    }
  });

  it("never marks a tool both read-only and destructive", () => {
    for (const tool of ALL_TOOLS) {
      if (tool.annotations.readOnlyHint) {
        expect(tool.annotations.destructiveHint, tool.name).toBe(false);
      }
    }
  });

  it("does not declare `verbose` on any tool — it is injected centrally", () => {
    for (const tool of ALL_TOOLS) {
      expect(Object.keys(tool.inputSchema), tool.name).not.toContain("verbose");
    }
  });

  it("resolves tools by name and does not expose removed 0.1.0 aliases", () => {
    expect(getTool("moderation_ban_user")?.name).toBe("moderation_ban_user");
    expect(getTool("chat_ban_user")).toBeUndefined();
    expect(getTool("auth_create_user_token")).toBeUndefined();
    expect(getTool("users_upsert")).toBeUndefined();
    expect(getTool("users_query")).toBeUndefined();
    expect(getTool("nope")).toBeUndefined();
  });

  it("covers every toolset", () => {
    const used = new Set(ALL_TOOLS.map((tool) => tool.toolset));
    for (const toolset of ALL_TOOLSETS) {
      expect(used, toolset).toContain(toolset);
    }
  });
});

/*
 * The README and configuration guide state tool counts in prose and in a
 * per-toolset table. Those are hand-maintained, and went stale twice in a row
 * (video-admin after 0.4.2, video after #38) without anything failing.
 */
describe("documented tool counts", () => {
  const readOnlyCount = ALL_TOOLS.filter((tool) => tool.annotations.readOnlyHint === true).length;
  const perToolset = (toolset: string) =>
    ALL_TOOLS.filter((tool) => tool.toolset === toolset).length;

  it.each(["README.md", "docs/configuration.md"])("%s matches the registry", (file) => {
    const text = readFileSync(join(ROOT, file), "utf8");

    for (const [, toolset, count] of text.matchAll(/^\| `([a-z-]+)`\s*\| (\d+)\s*\|/gm)) {
      expect(Number(count), `${file}: ${toolset} row`).toBe(perToolset(toolset));
    }
    for (const [, count] of text.matchAll(/\*\*(\d+) tools\*\*/g)) {
      expect(Number(count), `${file}: total`).toBe(ALL_TOOLS.length);
    }
    for (const [, count] of text.matchAll(/(?:Read-only: |only the )(\d+) tools/g)) {
      expect(Number(count), `${file}: read-only`).toBe(readOnlyCount);
    }
  });
});
