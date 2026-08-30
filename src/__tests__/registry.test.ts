import { describe, expect, it } from "vitest";
import { ALL_TOOLS, getTool } from "../tools/registry.js";
import { ALL_TOOLSETS } from "../config.js";

describe("tool registry", () => {
  it("has no duplicate names or aliases", () => {
    const names = ALL_TOOLS.flatMap((tool) => [tool.name, ...(tool.aliases ?? [])]);
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

  it("only aliases names that actually shipped in 0.1.0", () => {
    // An alias for a name that never existed offers a migration path to
    // nowhere. These are the 0.1.0 tool names.
    const shipped = new Set([
      "chat_create_token",
      "chat_upsert_users",
      "chat_create_channel",
      "chat_send_message",
      "chat_query_channels",
      "chat_query_users",
      "chat_add_members",
      "chat_update_channel",
      "chat_remove_members",
      "chat_ban_user",
      "chat_unban_user",
      "chat_delete_message",
      "chat_flag_message",
      "video_create_call",
      "video_get_call",
      "video_update_call",
      "video_end_call",
      "video_query_calls",
      "video_start_recording",
      "video_stop_recording",
      "video_list_recordings",
      "video_start_transcription",
      "video_stop_transcription",
      "video_list_transcriptions",
      "video_update_call_members",
      "video_query_call_members",
      "video_block_user",
      "video_unblock_user",
      "video_mute_users",
      // Names added in 0.2.0 that are also offered as forward-looking aliases.
      "users_upsert",
      "users_query",
      "auth_create_user_token",
    ]);
    for (const tool of ALL_TOOLS) {
      for (const alias of tool.aliases ?? []) {
        expect(shipped, `${tool.name} aliases ${alias}`).toContain(alias);
      }
    }
  });

  it("resolves tools by name and by deprecated alias", () => {
    expect(getTool("moderation_ban_user")?.name).toBe("moderation_ban_user");
    expect(getTool("chat_ban_user")?.name).toBe("moderation_ban_user");
    expect(getTool("nope")).toBeUndefined();
  });

  it("covers every toolset", () => {
    const used = new Set(ALL_TOOLS.map((tool) => tool.toolset));
    for (const toolset of ALL_TOOLSETS) {
      expect(used, toolset).toContain(toolset);
    }
  });
});
