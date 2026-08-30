import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureId, hasCredentials, LiveHarness } from "./harness.js";

const suite = hasCredentials ? describe : describe.skip;

/** Brief pause for Stream's type registry to converge after a write. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));

/**
 * Reads until a write is visible.
 *
 * Channel and call type writes are not immediately consistent, and the write's
 * own response can echo pre-update values — a fixed sleep was still flaking, so
 * convergence is asserted against a read instead of guessed at.
 */
async function eventually<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  label: string
): Promise<T> {
  let last: T | undefined;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    last = await read();
    if (done(last)) return last;
    await settle();
  }
  throw new Error(`${label} never converged: ${JSON.stringify(last).slice(0, 300)}`);
}

suite("live: channel types, call types and app settings", () => {
  const harness = new LiveHarness();
  const channelTypeName = fixtureId("chtype").replace(/-/g, "");
  const callTypeName = fixtureId("cltype").replace(/-/g, "");

  beforeAll(async () => {
    await harness.connect();
  }, 60_000);

  afterAll(async () => {
    await harness.teardown();
  }, 60_000);

  it("creates, updates and deletes a channel type", { timeout: 60_000 }, async () => {
    const created = await harness.call("chat_create_channel_type", {
      name: channelTypeName,
      automod: "disabled",
      automod_behavior: "flag",
      max_message_length: 5000,
      settings: { typing_events: true, read_events: true, replies: true },
    });
    harness.onCleanup(async () => {
      await harness.callEither("chat_delete_channel_type", { name: channelTypeName });
    });
    expect(created.name).toBe(channelTypeName);
    expect(created.typing_events).toBe(true);

    // Channel type creation is not immediately consistent: updating too soon
    // can return the pre-update values and fail intermittently.
    await settle();

    await harness.call("chat_update_channel_type", {
      name: channelTypeName,
      automod: "disabled",
      automod_behavior: "flag",
      max_message_length: 2000,
      settings: { typing_events: false },
    });
    const updated = await eventually(
      () => harness.call("chat_get_channel_type", { name: channelTypeName }),
      (type) => type.max_message_length === 2000 && type.typing_events === false,
      "channel type update"
    );
    expect(updated.max_message_length).toBe(2000);
    expect(updated.typing_events).toBe(false);

    const deleted = await harness.call("chat_delete_channel_type", { name: channelTypeName });
    expect(deleted.duration).toBeDefined();
  });

  it("creates, updates and deletes a call type", { timeout: 60_000 }, async () => {
    const created = await harness.call("video_create_call_type", {
      name: callTypeName,
      settings: {
        audio: { mic_default_on: true, default_device: "speaker" },
        backstage: { enabled: false },
      },
      grants: { host: ["join-call", "send-audio", "send-video"] },
    });
    harness.onCleanup(async () => {
      await harness.callEither("video_delete_call_type", { name: callTypeName });
    });
    expect(created.name).toBe(callTypeName);

    await settle();

    await harness.call("video_update_call_type", {
      name: callTypeName,
      settings: { backstage: { enabled: true } },
    });
    const updated = await eventually(
      () => harness.call("video_get_call_type", { name: callTypeName }),
      (type) => type.settings?.backstage?.enabled === true,
      "call type update"
    );
    expect(updated.settings.backstage.enabled).toBe(true);
    // Grants survive the projection on write responses too — a shrink-based
    // path would silently drop them, since `grants` is a NOISE_KEY.
    expect(updated.grants.host).toContain("join-call");

    const deleted = await harness.call("video_delete_call_type", { name: callTypeName });
    expect(deleted.duration).toBeDefined();
  });

  // Three sequential round trips to Stream; the 5s default is not enough
  // reliably, and a timeout here fails the whole live gate on main.
  it("round-trips an app setting without changing it", { timeout: 60_000 }, async () => {
    const before = await harness.call("app_get_settings");
    const current = before.app.async_url_enrich_enabled;
    // Coercing an absent value to false would make the round-trip assert
    // nothing: the test would write false and then match its own coercion.
    expect(typeof current).toBe("boolean");

    // Writes the value back unchanged: proves the tool reaches the endpoint
    // and is accepted, without altering the app's configuration.
    const result = await harness.call("app_update_settings", {
      settings: { async_url_enrich_enabled: current },
    });
    expect(result.duration).toBeDefined();

    const after = await harness.call("app_get_settings");
    expect(after.app.async_url_enrich_enabled).toBe(current);
  });
});
