/**
 * Coverage for the per-tool `compact` projections.
 *
 * These run through `applyCompaction` rather than calling `def.compact`
 * directly, so the `verbose` and default-`shrink` branches are exercised too —
 * "verbose:true does nothing" was a reported bug precisely because nobody
 * could see which branch a tool took.
 */
import { describe, expect, it } from "vitest";
import { applyCompaction, type AnyToolDef } from "../../tools/define.js";
import { getTool } from "../../tools/registry.js";
import { serialize } from "../../utils/format.js";

const tool = (name: string): AnyToolDef => {
  const found = getTool(name);
  if (!found) throw new Error(`Unknown tool: ${name}`);
  return found;
};

const view = (name: string, raw: unknown, args: Record<string, unknown> = {}): any =>
  applyCompaction(tool(name), raw, false, args as never);

const AT = new Date("2026-08-01T00:00:00.000Z");

const user = (id: string) => ({
  id,
  name: `User ${id}`,
  role: "user",
  banned: false,
  shadow_banned: false,
  online: false,
  invisible: false,
  language: "en",
  created_at: AT,
  updated_at: AT,
  last_active: AT,
  teams: [],
  custom: {},
  devices: [{ id: "d1", push_provider: "apn", created_at: AT }],
  mutes: [],
  channel_mutes: [],
  blocked_user_ids: [],
  unread_count: 0,
  total_unread_count: 0,
  unread_channels: 0,
  unread_threads: 0,
});

describe("chat_query_channels", () => {
  const channelRow = (index: number) => ({
    channel: {
      cid: `messaging:channel-${index}`,
      id: `channel-${index}`,
      type: "messaging",
      created_at: AT,
      updated_at: AT,
      last_message_at: AT,
      frozen: false,
      disabled: false,
      member_count: 4,
      custom: { name: `Channel ${index}` },
      // The two per-row constants that used to eat the byte budget.
      own_capabilities: Array.from({ length: 33 }, (_, i) => `send-message-capability-${i}`),
      config: { automod: "disabled", commands: ["giphy", "imgur", "ban", "mute", "unban"] },
      created_by: user("alice"),
    },
    members: Array.from({ length: 10 }, (_, i) => ({
      user_id: `member-${i}`,
      channel_role: "channel_member",
      user: user(`member-${i}`),
    })),
    messages: [],
    pinned_messages: [],
    threads: [],
    read: [],
  });

  it("fits a full 30-channel page inside the byte budget", () => {
    const raw = { duration: "12ms", channels: Array.from({ length: 30 }, (_, i) => channelRow(i)) };
    const text = serialize(view("chat_query_channels", raw));

    // Stream caps this endpoint at 30 rows, so losing any is losing the page.
    expect(text).not.toContain("_omitted_items");
    expect(JSON.parse(text).channels).toHaveLength(30);
  });

  it("drops the constants and reduces created_by to a reference", () => {
    const out = view("chat_query_channels", { channels: [channelRow(0)] });
    const row = out.channels[0];

    expect(row.own_capabilities).toBeUndefined();
    expect(row.config).toBeUndefined();
    expect(row.created_by).toEqual({ id: "alice", name: "User alice" });
    expect(row.member_ids).toEqual(["member-0", "member-1", "member-2", "member-3", "member-4"]);
    expect(row.custom).toEqual({ name: "Channel 0" });
  });

  it("never reports a message count it did not get from Stream", () => {
    // The old projection reported `messages.length` as `message_count`, which
    // with the default message_limit of 0 was always 0 — on a channel whose
    // `last_message_at` in the same row proved otherwise.
    const row = channelRow(0);
    const out = view("chat_query_channels", { channels: [row] });

    expect(out.channels[0].message_count).toBeUndefined();
    expect(out.channels[0].messages_returned).toBeUndefined();
    expect(out.channels[0].last_message_at).toEqual(AT);
  });

  it("passes Stream's own message_count through, and counts the page separately", () => {
    const row = channelRow(0);
    const withCount = {
      ...row,
      channel: { ...row.channel, message_count: 412 },
      messages: [{ id: "m1", text: "hi", created_at: AT, user: user("alice") }],
    };
    const out = view("chat_query_channels", { channels: [withCount] });

    expect(out.channels[0].message_count).toBe(412);
    expect(out.channels[0].messages_returned).toBe(1);
    expect(out.channels[0].messages).toEqual([
      { id: "m1", text: "hi", created_at: AT, user: { id: "alice", name: "User alice" } },
    ]);
  });
});

describe("chat_query_users", () => {
  it("fits a full 100-user page and keeps only filterable fields", () => {
    const raw = { duration: "9ms", users: Array.from({ length: 100 }, (_, i) => user(`u-${i}`)) };
    const text = serialize(view("chat_query_users", raw));

    expect(text).not.toContain("_omitted_items");
    const parsed = JSON.parse(text);
    expect(parsed.users).toHaveLength(100);
    expect(parsed.users[0].devices).toBeUndefined();
    expect(parsed.users[0].unread_count).toBeUndefined();
    expect(parsed.users[0].id).toBe("u-0");
  });

  it("collapses the boolean flags to the ones that are set", () => {
    const out = view("chat_query_users", {
      users: [{ ...user("banned-one"), banned: true, online: true }],
    });
    expect(out.users[0].flags).toEqual(["banned", "online"]);
    expect(view("chat_query_users", { users: [user("quiet")] }).users[0].flags).toEqual([]);
  });

  it("keeps deactivated_at, which is the whole point of a deactivation audit", () => {
    const out = view("chat_query_users", {
      users: [{ ...user("gone"), deactivated_at: AT }],
      scan: { scanned: 500, pages: 5, complete: false, next_id: "u-499" },
    });

    expect(out.users[0].deactivated_at).toEqual(AT);
    expect(out.scan).toEqual({ scanned: 500, pages: 5, complete: false, next_id: "u-499" });
  });
});

describe("video_query_call_participants", () => {
  const raw = (participants: unknown[]) => ({
    duration: "5ms",
    total_participants: participants.length,
    participants,
    members: [{ user_id: "alice", role: "host", user: user("alice") }],
    own_capabilities: ["join-call", "send-audio"],
    call: {
      cid: "default:standup",
      id: "standup",
      type: "default",
      backstage: false,
      current_session_id: "",
      created_at: AT,
      created_by: user("alice"),
      settings: {
        ingress: {
          video_encoding_options: {
            "1280x720x30": { name: "720p", bitrate: 3_000_000 },
            "1920x1080x30": { name: "1080p", bitrate: 5_000_000 },
          },
        },
        broadcasting: { enabled: true, hls: { layout: { options: { a: 1 } } } },
      },
      egress: { rtmps: [], hls: { playlist_url: "https://example.invalid/x.m3u8" } },
    },
  });

  it("keeps the participants and drops the call configuration around them", () => {
    const out = view("video_query_call_participants", raw([]));

    expect(out.call).toBeUndefined();
    expect(out.call_cid).toBe("default:standup");
    expect(out.total_participants).toBe(0);
    expect(out.member_count).toBe(1);
  });

  it("explains an empty list instead of leaving it to be read as missing data", () => {
    expect(view("video_query_call_participants", raw([]))._hint).toMatch(/no session is live/);
    expect(view("video_query_call_participants", raw([])).session_id).toBeUndefined();
  });

  it("distinguishes a filter that matched nobody from a call with no session", () => {
    const live = raw([]);
    live.call.current_session_id = "session-9";
    const out = view("video_query_call_participants", live);

    expect(out.session_id).toBe("session-9");
    expect(out._hint).toMatch(/A session IS live/);
    expect(out._hint).not.toMatch(/no session is live/);
  });

  it("projects a participant to who they are and when they joined", () => {
    const out = view(
      "video_query_call_participants",
      raw([{ user: user("bob"), role: "host", joined_at: AT, user_session_id: "s-1" }])
    );

    expect(out.participants).toEqual([
      { user_id: "bob", name: "User bob", role: "host", joined_at: AT, user_session_id: "s-1" },
    ]);
    expect(out._hint).not.toMatch(/nobody is connected/);
  });
});

describe("video_get_call_report", () => {
  const report = (minutes: number, sessionParticipants: unknown[] = []) => ({
    duration: "30ms",
    session_id: "session-1",
    report: {
      call: { score: 4.2, started_at: AT, ended_at: AT },
      user_ratings: { average: 4, count: 3 },
      participants: {
        sum: 12,
        unique: 6,
        max_concurrent: 4,
        by_country: Array.from({ length: 12 }, (_, i) => ({ name: `C${i}`, unique: i })),
        by_browser: [{ name: "chrome", unique: 5 }],
        publishers: { total: 4, unique: 3, by_track: [{ track_type: "video", total: 4 }] },
        subscribers: { total: 6, unique: 6, total_subscribed_duration_seconds: 900 },
        count_over_time: {
          by_minute: Array.from({ length: minutes }, (_, i) => ({
            first: 1,
            last: 2,
            max: i % 7,
            min: 0,
            start_ts: AT,
          })),
        },
      },
    },
    chat_activity: {
      messages: {
        count_over_time: [
          { count: 3, start_ts: AT },
          { count: 4, start_ts: AT },
        ],
      },
    },
    digest: { schema_version: "1", audience: {}, broadcast: {} },
    session: {
      id: "session-1",
      participants: sessionParticipants,
      anonymous_participant_count: 0,
      accepted_by: { alice: AT },
      missed_by: {},
      rejected_by: {},
      participants_count_by_role: { host: 1 },
      started_at: AT,
      ended_at: AT,
    },
  });

  it("summarises the per-minute series instead of cutting a hole in it", () => {
    const out = view("video_get_call_report", report(240));

    expect(out.participants.over_time).toEqual({ minutes: 240, peak: 6, from: AT, to: AT });
    expect(out.participants.count_over_time).toBeUndefined();
    expect(out.participants.by_country).toHaveLength(5);
    expect(out.chat_activity).toEqual({ messages: 7, minutes: 2 });
    expect(out.digest_available).toBe(true);
    expect(out.digest).toBeUndefined();
    expect(serialize(out).length).toBeLessThan(2_000);
  });

  it("says why session.participants is empty rather than letting it look withheld", () => {
    expect(view("video_get_call_report", report(3))._hint).toMatch(/clears the live-participant/);
    expect(
      view("video_get_call_report", report(3, [{ user: user("bob"), role: "host", joined_at: AT }]))
        ._hint
    ).not.toMatch(/clears the live-participant/);
  });

  it("honours verbose by returning the response untouched", () => {
    const raw = report(240);
    expect(applyCompaction(tool("video_get_call_report"), raw, true)).toBe(raw);
  });
});

describe("video_get_call_type", () => {
  const layout = () => ({
    name: "spotlight",
    external_app_url: "",
    external_css_url: "",
    detect_orientation: false,
    options: Object.fromEntries(
      Array.from({ length: 55 }, (_, i) => [`participant_label.option_${i}`, `value-${i}`])
    ),
  });

  const callType = {
    name: "default",
    created_at: AT,
    updated_at: AT,
    duration: "8ms",
    grants: {
      host: ["join-call", "send-audio", "send-video", "start-recording"],
      user: ["join-call", "send-audio"],
    },
    notification_settings: { enabled: false },
    settings: {
      audio: { mic_default_on: true, noise_cancellation: { mode: "auto-on" } },
      backstage: { enabled: false },
      limits: { max_participants: 25, max_duration_seconds: 3600 },
      session: { inactivity_timeout_seconds: 30 },
      transcription: { mode: "available", languages: ["en"] },
      video: { camera_default_on: true, enabled: true },
      broadcasting: {
        enabled: true,
        hls: { enabled: true, auto_on: false, quality_tracks: ["720p"], layout: layout() },
        rtmp: { enabled: true, quality: "720p", layout: layout() },
      },
      recording: { mode: "available", quality: "720p", audio_only: false, layout: layout() },
      ingress: {
        enabled: false,
        video_encoding_options: {
          "1280x720x30": { name: "720p", bitrate: 3_000_000, layers: [1, 2, 3] },
          "1920x1080x30": { name: "1080p", bitrate: 5_000_000, layers: [1, 2, 3] },
          "2560x1440x30": { name: "1440p", bitrate: 8_000_000, layers: [1, 2, 3] },
          "3840x2160x30": { name: "2160p", bitrate: 14_000_000, layers: [1, 2, 3] },
        },
      },
    },
  };

  it("keeps the grants — the reason to call this tool at all", () => {
    // `grants` is one of the shrinker's NOISE_KEYS, so any shrink-based path
    // would delete exactly the field this tool exists to return.
    expect(view("video_get_call_type", callType).grants).toEqual(callType.grants);
  });

  it("keeps every behaviour-gating setting", () => {
    const out = view("video_get_call_type", callType);

    expect(out.settings.backstage).toEqual({ enabled: false });
    expect(out.settings.limits.max_participants).toBe(25);
    expect(out.settings.session.inactivity_timeout_seconds).toBe(30);
    expect(out.settings.transcription.mode).toBe("available");
    expect(out.settings.recording.mode).toBe("available");
    expect(out.settings.broadcasting.enabled).toBe(true);
    expect(out.settings.ingress.enabled).toBe(false);
    expect(out.settings.audio.noise_cancellation.mode).toBe("auto-on");
  });

  it("collapses the three layout blobs and the encoder ladder", () => {
    const out = view("video_get_call_type", callType);

    expect(out.settings.recording.layout.options).toEqual({ count: 55 });
    expect(out.settings.broadcasting.hls.layout.options).toEqual({ count: 55 });
    expect(out.settings.broadcasting.rtmp.layout.name).toBe("spotlight");
    expect(out.settings.ingress.video_encoding_options.keys).toContain("1920x1080x30");
    expect(out.settings.ingress.video_encoding_options.count).toBe(4);
  });

  it("cuts the response by most of its size", () => {
    const before = serialize(callType).length;
    const after = serialize(view("video_get_call_type", callType)).length;
    expect(after).toBeLessThan(before / 3);
  });
});

describe("app_get_rate_limits", () => {
  const raw = {
    duration: "3ms",
    server_side: {
      UpdateChannelPartial: { limit: 300, remaining: 300, reset: 1_788_112_800 },
      QueryChannels: { limit: 10_000, remaining: 9_998, reset: 1_788_112_800 },
    },
  };

  it("returns a named endpoint even when none of its quota is used", () => {
    // The reported bug: the consumed-only filter also applied to endpoints the
    // caller had asked for by name, so the normal case came back empty.
    const out = view("app_get_rate_limits", raw, { endpoints: "UpdateChannelPartial" });

    expect(out.server_side.limits.UpdateChannelPartial.limit).toBe(300);
    expect(out.server_side.consumed).toBeUndefined();
  });

  it("names the endpoints Stream did not recognise", () => {
    const out = view("app_get_rate_limits", raw, {
      endpoints: "UpdateChannelPartial, NoSuchEndpoint",
    });
    expect(out.unmatched_endpoints).toEqual(["NoSuchEndpoint"]);
  });

  it("still defaults to consumed quota only when no endpoint is named", () => {
    const out = view("app_get_rate_limits", raw);

    expect(Object.keys(out.server_side.consumed)).toEqual(["QueryChannels"]);
    expect(out.server_side.endpoint_count).toBe(2);
    expect(out.unmatched_endpoints).toBeUndefined();
  });

  it("treats a blank endpoint list as no filter at all", () => {
    // `"".split(",").filter(Boolean)` is `[]`, which is truthy — it must not
    // select every endpoint.
    for (const endpoints of ["", " , "]) {
      const out = view("app_get_rate_limits", raw, { endpoints });
      expect(Object.keys(out.server_side.consumed)).toEqual(["QueryChannels"]);
      expect(out.server_side.limits).toBeUndefined();
      expect(out.unmatched_endpoints).toBeUndefined();
    }
  });

  it("keeps the unity group, so its endpoints are not reported as unknown", () => {
    const out = view(
      "app_get_rate_limits",
      { ...raw, unity: { UnityConnect: { limit: 100, remaining: 100, reset: 1 } } },
      { endpoints: "UnityConnect" }
    );

    expect(out.unity.limits.UnityConnect.limit).toBe(100);
    expect(out.unmatched_endpoints).toBeUndefined();
  });
});
