import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureId, hasCredentials, LiveHarness } from "./harness.js";

const suite = hasCredentials ? describe : describe.skip;

/**
 * Errors that mean the request itself was malformed. Probes for endpoints that
 * need a live participant must reject these: the point of those probes is that
 * a wrong field shows up here rather than as a backend state error.
 */
const SCHEMA_ERROR =
  /404 |Invalid input|is a required field|unknown field|cannot be blank|must be provided/i;

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
    harness.trackUsers(host, guest);
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
    harness.deleteCallOnCleanup("default", callId);

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
      // Stream requires `quality` once recording is enabled and not audio-only.
      settings_override: {
        recording: { mode: "available", quality: "720p" },
        backstage: { enabled: true },
      },
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
    // Must be the backend refusing on state, not a rejected request shape: a
    // bad recording_type would 404 on the URL path instead.
    expect(error).toMatch(/no active session|egress is not running|not being recorded/i);
    expect(error).not.toMatch(/Invalid input|is a required field|unknown field/i);
  });

  it("reaches the transcription endpoint", async () => {
    const error = await harness.callExpectingError("video_start_transcription", call);
    expect(error).toMatch(/no active session|transcription is disabled|not enabled/i);
    expect(error).not.toMatch(/Invalid input|is a required field|unknown field/i);
  });

  it("reaches the stop-transcription endpoint", async () => {
    const error = await harness.callExpectingError("video_stop_transcription", call);
    expect(error).toMatch(/not being transcribed|no active session/i);
    expect(error).not.toMatch(/Invalid input|is a required field|unknown field/i);
  });

  it("queries call participants", async () => {
    const result = await harness.call("video_query_call_participants", {
      ...call,
      user_ids: [host],
    });
    expect(Array.isArray(result.participants)).toBe(true);
  });

  it("rings the call members", async () => {
    const result = await harness.callEither("video_ring_call", { ...call, member_ids: [guest] });
    // Ringing needs the members to be reachable; either way the request shape
    // is what is under test.
    expect(result.text).not.toMatch(SCHEMA_ERROR);
  });

  it("mutes a participant", async () => {
    const result = await harness.call("video_mute_users", {
      ...call,
      user_ids: [guest],
      muted_by_id: host,
    });
    expect(result.duration).toBeDefined();
  });

  it("kicks a user", async () => {
    const result = await harness.callEither("video_kick_user", {
      ...call,
      user_id: guest,
      kicked_by_id: host,
    });
    expect(result.text).not.toMatch(SCHEMA_ERROR);
  });

  it("pins and unpins a participant", async () => {
    // Pinning targets a live session, which a server-side test cannot start.
    const pin = await harness.callEither("video_pin", {
      ...call,
      session_id: "no-such-session",
      user_id: guest,
    });
    expect(pin.text).not.toMatch(SCHEMA_ERROR);

    const unpin = await harness.callEither("video_unpin", {
      ...call,
      session_id: "no-such-session",
      user_id: guest,
    });
    expect(unpin.text).not.toMatch(SCHEMA_ERROR);
  });

  it("reaches the closed-caption endpoints", async () => {
    const start = await harness.callEither("video_start_closed_captions", {
      ...call,
      language: "en",
    });
    expect(start.text).not.toMatch(SCHEMA_ERROR);

    const stop = await harness.callEither("video_stop_closed_captions", call);
    expect(stop.text).not.toMatch(SCHEMA_ERROR);
  });

  it("reaches the HLS broadcasting endpoints", async () => {
    const start = await harness.callEither("video_start_hls_broadcasting", call);
    expect(start.text).not.toMatch(SCHEMA_ERROR);

    const stop = await harness.callEither("video_stop_hls_broadcasting", call);
    expect(stop.text).not.toMatch(SCHEMA_ERROR);
  });

  // Stream dials the destination, so an unreachable URL takes a while to fail.
  it("reaches the RTMP broadcasting endpoints", { timeout: 30_000 }, async () => {
    const start = await harness.callEither("video_start_rtmp_broadcasts", {
      ...call,
      broadcasts: [{ name: "mcptest", stream_url: "rtmp://example.invalid/live" }],
    });
    expect(start.text).not.toMatch(SCHEMA_ERROR);

    const stopOne = await harness.callEither("video_stop_rtmp_broadcast", {
      ...call,
      name: "mcptest",
    });
    expect(stopOne.text).not.toMatch(SCHEMA_ERROR);

    const stopAll = await harness.callEither("video_stop_all_rtmp_broadcasts", call);
    expect(stopAll.text).not.toMatch(SCHEMA_ERROR);
  });

  it("rejects deleting a recording that does not exist", async () => {
    const error = await harness.callExpectingError("video_delete_recording", {
      ...call,
      session: "no-such-session",
      filename: "no-such-file.mp4",
    });
    expect(error).toMatch(/exist|not found/i);
  });

  it("rejects deleting a transcription that does not exist", async () => {
    const error = await harness.callExpectingError("video_delete_transcription", {
      ...call,
      session: "no-such-session",
      filename: "no-such-file.jsonl",
    });
    expect(error).toMatch(/exist|not found/i);
  });

  it("reaches the call report endpoint", async () => {
    const result = await harness.callEither("video_get_call_report", call);
    // Without a finished session there is no report, but the path must resolve.
    expect(result.text).not.toMatch(SCHEMA_ERROR);
  });

  it("queries call stats", async () => {
    const result = await harness.call("video_query_call_stats", {
      filter_conditions: { call_cid: { $eq: `default:${callId}` } },
    });
    expect(result.reports ?? result.duration).toBeDefined();
  });

  it("deletes a throwaway call", async () => {
    const throwaway = fixtureId("delcall");
    await harness.call("video_create_call", {
      call_type: "default",
      call_id: throwaway,
      created_by_id: host,
    });
    const result = await harness.call("video_delete_call", {
      call_type: "default",
      call_id: throwaway,
      hard: true,
    });
    expect(result.duration ?? result.call).toBeDefined();
  });

  it("ends the call", async () => {
    const result = await harness.call("video_end_call", call);
    expect(result.duration).toBeDefined();
  });
});
