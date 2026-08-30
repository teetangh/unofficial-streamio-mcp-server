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
    await harness.call("chat_upsert_users", {
      users: [
        { id: host, name: "MCP Test Host", role: "admin" },
        { id: guest, name: "MCP Test Guest", role: "user" },
      ],
    });
    harness.onCleanup(() =>
      harness.call("users_delete", { user_ids: [host, guest], user: "hard", calls: "hard" })
    );
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
    harness.onCleanup(() => harness.call("video_delete_call", { ...call, hard: true }));

    expect(result.call.cid).toBe(`default:${callId}`);
    expect(result.call.created_by.id).toBe(host);
    expect(result.call.custom.topic).toBe("mcp-live-suite");
  });

  it("mints a call-scoped token", async () => {
    const result = await harness.call("auth_create_call_token", {
      user_id: guest,
      call_cids: [`default:${callId}`],
      role: "user",
      validity_in_seconds: 300,
    });
    expect(result.token.split(".")).toHaveLength(3);
    expect(result.call_cids).toEqual([`default:${callId}`]);
  });

  it("gets the call", async () => {
    const result = await harness.call("video_get_call", call);
    expect(result.call.cid).toBe(`default:${callId}`);
  });

  it("updates call settings and custom data", async () => {
    const result = await harness.call("video_update_call", {
      ...call,
      custom: { topic: "updated" },
      settings_override: { recording: { mode: "available" }, backstage: { enabled: true } },
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
    const after = await harness.call("video_get_call", call);
    expect(after.call.blocked_user_ids).toContain(guest);

    await harness.call("video_unblock_user", { ...call, user_id: guest });
  });

  it("grants and revokes call permissions", async () => {
    const granted = await harness.call("video_update_user_permissions", {
      ...call,
      user_id: guest,
      grant_permissions: ["send-audio"],
    });
    expect(granted.duration).toBeDefined();

    await harness.call("video_update_user_permissions", {
      ...call,
      user_id: guest,
      revoke_permissions: ["send-audio"],
    });
  });

  it("sends a custom call event", async () => {
    const result = await harness.call("video_send_call_event", {
      ...call,
      user_id: host,
      custom: { "render-animation": "balloons" },
    });
    expect(result.duration).toBeDefined();
  });

  it("goes live and stops live", async () => {
    const live = await harness.call("video_go_live", call);
    expect(live.call.backstage).toBe(false);

    const stopped = await harness.call("video_stop_live", call);
    expect(stopped.call.backstage).toBe(true);
  });

  it("lists recordings and transcriptions", async () => {
    const recordings = await harness.call("video_list_recordings", call);
    expect(Array.isArray(recordings.recordings)).toBe(true);

    const transcriptions = await harness.call("video_list_transcriptions", call);
    expect(Array.isArray(transcriptions.transcriptions)).toBe(true);
  });

  // These require a live session with a participant, which a server-side test
  // cannot create. Asserting the *specific* backend error still proves the
  // request was well-formed — a bad `recording_type` would 404 on the path
  // instead, which is exactly the bug this suite exists to catch.
  it("reaches the recording endpoint with a valid recording_type", async () => {
    const error = await harness.callExpectingError("video_start_recording", call);
    expect(error).toMatch(/no active session/i);
  });

  it("reaches the stop-recording endpoint with a valid recording_type", async () => {
    const error = await harness.callExpectingError("video_stop_recording", call);
    expect(error).not.toMatch(/404|not found|invalid/i);
  });

  it("reaches the transcription endpoint", async () => {
    const error = await harness.callExpectingError("video_start_transcription", call);
    expect(error).toMatch(/no active session|not enabled|transcription/i);
  });

  it("reaches the stop-transcription endpoint", async () => {
    const error = await harness.callExpectingError("video_stop_transcription", call);
    expect(error).toMatch(/not being transcribed|no active session|transcription/i);
  });

  it("queries call participants", async () => {
    const result = await harness.call("video_query_call_participants", call);
    expect(Array.isArray(result.participants)).toBe(true);
  });

  it("ends the call", async () => {
    const result = await harness.call("video_end_call", call);
    expect(result.duration).toBeDefined();
  });
});
