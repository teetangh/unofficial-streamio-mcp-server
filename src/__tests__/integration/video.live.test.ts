import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureId, hasCredentials, LiveHarness } from "./harness.js";

const suite = hasCredentials ? describe : describe.skip;

suite("live: video", () => {
  const harness = new LiveHarness();
  const host = fixtureId("host");
  const guest = fixtureId("guest");
  const callId = fixtureId("call");
  const call = { call_type: "default", call_id: callId };

  beforeAll(async () => {
    await harness.connect();
    harness.deleteUsersOnCleanup([host, guest]);
    harness.deleteCallOnCleanup("default", callId);

    await harness.call("chat_upsert_users", {
      users: [
        { id: host, name: "MCP Test Host", role: "admin" },
        { id: guest, name: "MCP Test Guest", role: "user" },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await harness.teardown();
  }, 60_000);

  it("creates a call", async () => {
    const result = await harness.call("video_create_call", {
      ...call,
      created_by_id: host,
      members: [{ user_id: host, role: "host" }, guest],
      custom: { topic: "mcp-live-suite" },
    });

    expect(result.call.cid).toBe(`default:${callId}`);
    expect(result.call.created_by.id).toBe(host);
    expect(result.call.custom.topic).toBe("mcp-live-suite");
  });

  it("gets the call", async () => {
    const result = await harness.call("video_get_call", call);
    expect(result.call.cid).toBe(`default:${callId}`);
  });

  it("updates settings and custom data", async () => {
    const result = await harness.call("video_update_call", {
      ...call,
      custom: { topic: "updated" },
      // Stream requires `quality` once recording is enabled and not audio-only.
      settings_override: { recording: { mode: "available", quality: "720p" } },
    });
    expect(result.call.custom.topic).toBe("updated");
    expect(result.call.settings.recording.mode).toBe("available");
  });

  it("queries calls", async () => {
    const result = await harness.call("video_query_calls", {
      filter_conditions: { cid: { $eq: `default:${callId}` } },
    });
    expect(result.calls).toHaveLength(1);
  });

  it("manages call members", async () => {
    const updated = await harness.call("video_update_call_members", {
      ...call,
      update_members: [{ user_id: guest, role: "speaker" }],
    });
    expect(updated.members.some((m: any) => m.user_id === guest)).toBe(true);

    const queried = await harness.call("video_query_call_members", {
      ...call,
      filter_conditions: { user_id: { $eq: guest } },
    });
    expect(queried.members).toHaveLength(1);
  });

  it("blocks and unblocks a user", async () => {
    await harness.call("video_block_user", { ...call, user_id: guest });
    const blocked = await harness.call("video_get_call", call);
    expect(blocked.call.blocked_user_ids).toContain(guest);

    await harness.call("video_unblock_user", { ...call, user_id: guest });
    const unblocked = await harness.call("video_get_call", call);
    expect(unblocked.call.blocked_user_ids ?? []).not.toContain(guest);
  });

  it("lists recordings and transcriptions", async () => {
    const recordings = await harness.call("video_list_recordings", call);
    expect(Array.isArray(recordings.recordings)).toBe(true);

    const transcriptions = await harness.call("video_list_transcriptions", call);
    expect(Array.isArray(transcriptions.transcriptions)).toBe(true);
  });

  // Recording and transcription need a live session with a participant, which
  // a server-side test cannot create. Asserting the *specific* backend error
  // still proves the request was well-formed — an invalid recording_type would
  // 404 on the URL path instead, which is the bug this suite exists to catch.
  it("reaches the start-recording endpoint with a valid recording_type", async () => {
    const error = await harness.callExpectingError("video_start_recording", call);
    expect(error).toMatch(/no active session/i);
  });

  it("reaches the stop-recording endpoint with a valid recording_type", async () => {
    const error = await harness.callExpectingError("video_stop_recording", call);
    expect(error).not.toMatch(/404|not found|invalid/i);
  });

  it("reaches the start-transcription endpoint", async () => {
    const error = await harness.callExpectingError("video_start_transcription", call);
    expect(error).toMatch(/no active session|not enabled|transcription/i);
  });

  it("reaches the stop-transcription endpoint", async () => {
    const error = await harness.callExpectingError("video_stop_transcription", call);
    expect(error).toMatch(/not being transcribed|no active session|transcription/i);
  });

  it("rejects a mute with no target", async () => {
    const error = await harness.callExpectingError("video_mute_users", {
      ...call,
      muted_by_id: host,
    });
    expect(error).toMatch(/`user_ids` or `mute_all_users: true`/);
  });

  it("mutes a user", async () => {
    const result = await harness.call("video_mute_users", {
      ...call,
      user_ids: [guest],
      muted_by_id: host,
    });
    expect(result.duration).toBeDefined();
  });

  it("ends the call", async () => {
    const result = await harness.call("video_end_call", call);
    expect(result.duration).toBeDefined();
  });
});
