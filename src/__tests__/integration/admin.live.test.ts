import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureId, hasCredentials, LiveHarness } from "./harness.js";

const suite = hasCredentials ? describe : describe.skip;

const SCHEMA_ERROR =
  /404 |Invalid input|is a required field|unknown field|cannot be blank|must be provided/i;

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

  it(
    "creates, updates, reads, lists and deletes a slash command",
    { timeout: 30_000 },
    async () => {
      const cmdName = fixtureId("cmd").replace(/-/g, "").slice(0, 18);
      const created = await harness.call("chat_create_command", {
        name: cmdName,
        description: "MCP test command",
        args: "[query]",
      });
      harness.onCleanup(async () => {
        await harness.callEither("chat_delete_command", { name: cmdName });
      });
      expect(created.command.name).toBe(cmdName);

      const fetched = await harness.call("chat_get_command", { name: cmdName });
      expect(fetched.name).toBe(cmdName);

      const updated = await harness.call("chat_update_command", {
        name: cmdName,
        description: "Updated MCP test command",
        args: "[query]",
      });
      expect(updated.command.description).toBe("Updated MCP test command");

      const listed = await harness.call("chat_list_commands", {});
      expect(listed.commands.some((c: any) => c.name === cmdName)).toBe(true);

      await harness.call("chat_delete_command", { name: cmdName });
    }
  );

  it("reaches push notification template endpoints", async () => {
    const getRes = await harness.callEither("chat_get_push_templates", {
      push_provider_type: "firebase",
    });
    expect(getRes.text).not.toMatch(SCHEMA_ERROR);

    const upsertRes = await harness.callEither("chat_upsert_push_template", {
      push_provider_type: "firebase",
      event_type: "message.new",
      template: "{{ message.text }}",
    });
    expect(upsertRes.text).not.toMatch(SCHEMA_ERROR);
  });

  it(
    "lists permissions, gets a permission, and manages custom roles",
    { timeout: 30_000 },
    async () => {
      const perms = await harness.call("app_list_permissions", {});
      expect(perms.permissions.length).toBeGreaterThan(0);

      const singlePerm = await harness.call("app_get_permission", { id: "create-channel" });
      expect(singlePerm.permission.id).toBe("create-channel");

      const roles = await harness.call("app_list_roles", {});
      expect(roles.roles.length).toBeGreaterThan(0);

      const roleName = fixtureId("role").replace(/-/g, "").slice(0, 18);
      const createdRole = await harness.callEither("app_create_role", { name: roleName });
      expect(createdRole.text).not.toMatch(SCHEMA_ERROR);
      harness.onCleanup(async () => {
        await harness.callEither("app_delete_role", { name: roleName });
      });

      const deletedRole = await harness.callEither("app_delete_role", { name: roleName });
      expect(deletedRole.text).not.toMatch(SCHEMA_ERROR);
    }
  );

  it(
    "lists push providers without leaking secrets and reaches push/webhook/storage endpoints",
    { timeout: 30_000 },
    async () => {
      const providers = await harness.call("app_list_push_providers", {});
      expect(Array.isArray(providers.push_providers)).toBe(true);
      for (const provider of providers.push_providers) {
        expect(provider.apn_auth_key).toBeUndefined();
        expect(provider.apn_p12_cert).toBeUndefined();
        expect(provider.firebase_credentials).toBeUndefined();
        expect(provider.firebase_server_key).toBeUndefined();
        expect(provider.huawei_app_secret).toBeUndefined();
        expect(provider.xiaomi_app_secret).toBeUndefined();
      }

      const providerName = fixtureId("pushprov");
      const upsertProvider = await harness.callEither("app_upsert_push_provider", {
        type: "firebase",
        name: providerName,
        description: "MCP test push provider",
        firebase_credentials: '{"type":"service_account","project_id":"invalid"}',
      });
      expect(upsertProvider.text).not.toMatch(SCHEMA_ERROR);
      if (upsertProvider.ok) {
        harness.onCleanup(async () => {
          await harness.callEither("app_delete_push_provider", {
            type: "firebase",
            name: providerName,
          });
        });
      }

      const deleteProvider = await harness.callEither("app_delete_push_provider", {
        type: "firebase",
        name: providerName,
      });
      expect(deleteProvider.text).not.toMatch(SCHEMA_ERROR);

      const checkPushRes = await harness.callEither("app_check_push", {
        skip_devices: true,
        event_type: "message.new",
      });
      expect(checkPushRes.text).not.toMatch(SCHEMA_ERROR);

      const webhookCheck = await harness.call("app_verify_webhook", {
        raw_body: '{"type":"health.check"}',
        signature: "deadbeef",
      });
      expect(webhookCheck.valid).toBe(false);

      const storages = await harness.call("app_list_external_storage", {});
      expect(storages.external_storages).toBeDefined();

      const storageName = fixtureId("extstore");
      const createStorage = await harness.callEither("app_create_external_storage", {
        name: storageName,
        storage_type: "s3",
        bucket: "mcp-nonexistent-test-bucket",
        aws_s3: { s3_region: "us-east-1" },
      });
      expect(createStorage.text).not.toMatch(SCHEMA_ERROR);
      if (createStorage.ok) {
        harness.onCleanup(async () => {
          await harness.callEither("app_delete_external_storage", {
            name: storageName,
          });
        });
      }

      const updateStorage = await harness.callEither("app_update_external_storage", {
        name: storageName,
        storage_type: "s3",
        bucket: "mcp-nonexistent-test-bucket-2",
        aws_s3: { s3_region: "us-east-1" },
      });
      expect(updateStorage.text).not.toMatch(SCHEMA_ERROR);

      const checkStorage = await harness.callEither("app_check_external_storage", {
        name: storageName,
      });
      expect(checkStorage.text).not.toMatch(SCHEMA_ERROR);

      const deleteStorage = await harness.callEither("app_delete_external_storage", {
        name: storageName,
      });
      expect(deleteStorage.text).not.toMatch(SCHEMA_ERROR);
    }
  );
});
