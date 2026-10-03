import { generateKeyPairSync } from "node:crypto";
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
      const createdRole = await harness.call("app_create_role", { name: roleName });
      harness.onCleanup(async () => {
        await harness.callEither("app_delete_role", { name: roleName });
      });
      expect(createdRole.role.name).toBe(roleName);

      await eventually(
        () => harness.call("app_list_roles", {}),
        (r) => r.roles.some((role: any) => role.name === roleName),
        "role creation"
      );

      const deletedRole = await harness.call("app_delete_role", { name: roleName });
      expect(deletedRole.duration).toBeDefined();
    }
  );

  it(
    "upserts an APN push provider, verifies secret redaction across tools, and manages external storage",
    { timeout: 45_000 },
    async () => {
      const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const apnAuthKey = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

      const providerName = fixtureId("pushprov");
      const upsertProvider = await harness.call("app_upsert_push_provider", {
        type: "apn",
        name: providerName,
        description: "MCP test APN provider",
        apn_auth_key: apnAuthKey,
        apn_key_id: "ABCD123456",
        apn_team_id: "TEAM123456",
        apn_topic: "com.example.mcptest",
        apn_development: true,
      });
      harness.onCleanup(async () => {
        await harness.callEither("app_delete_push_provider", {
          type: "apn",
          name: providerName,
        });
      });
      expect(upsertProvider.push_provider.name).toBe(providerName);
      expect(upsertProvider.push_provider.apn_auth_key).toBeUndefined();

      const listedCompact = await harness.call("app_list_push_providers", {});
      const matchedCompact = listedCompact.push_providers.find((p: any) => p.name === providerName);
      expect(matchedCompact).toBeDefined();
      expect(matchedCompact.apn_auth_key).toBeUndefined();

      const listedVerbose = await harness.call("app_list_push_providers", { verbose: true });
      const matchedVerbose = listedVerbose.push_providers.find((p: any) => p.name === providerName);
      expect(matchedVerbose).toBeDefined();
      expect(matchedVerbose.apn_auth_key).toBeUndefined();

      const settingsCompact = await harness.call("app_get_settings", {});
      expect(settingsCompact.app.sns_secret).toBeUndefined();
      expect(settingsCompact.app.sqs_secret).toBeUndefined();
      const settingsProvidersCompact = settingsCompact.app?.push_notifications?.providers ?? [];
      for (const provider of settingsProvidersCompact) {
        expect(provider.apn_auth_key).toBeUndefined();
      }

      // Raw GetApp embeds every channel and call type config (~55KB), which
      // exceeds the default 30KB cap; raise the cap to verify that verbose:true
      // also strips push provider keys and SQS/SNS secrets in the handler.
      const prevMaxBytes = process.env.STREAM_MCP_MAX_RESPONSE_BYTES;
      process.env.STREAM_MCP_MAX_RESPONSE_BYTES = "200000";
      try {
        const settingsVerbose = await harness.call("app_get_settings", { verbose: true });
        expect(settingsVerbose.app.sns_secret).toBeUndefined();
        expect(settingsVerbose.app.sqs_secret).toBeUndefined();
        const settingsProvidersVerbose = settingsVerbose.app?.push_notifications?.providers ?? [];
        for (const provider of settingsProvidersVerbose) {
          expect(provider.apn_auth_key).toBeUndefined();
        }
      } finally {
        if (prevMaxBytes === undefined) delete process.env.STREAM_MCP_MAX_RESPONSE_BYTES;
        else process.env.STREAM_MCP_MAX_RESPONSE_BYTES = prevMaxBytes;
      }

      const settingsResource = await harness.readResource("stream://app/settings");
      expect(settingsResource.app.sns_secret).toBeUndefined();
      expect(settingsResource.app.sqs_secret).toBeUndefined();
      const resourceProviders = settingsResource.app?.push_notifications?.providers ?? [];
      for (const provider of resourceProviders) {
        expect(provider.apn_auth_key).toBeUndefined();
      }

      await harness.call("app_delete_push_provider", {
        type: "apn",
        name: providerName,
      });

      const pushUser = fixtureId("pushusr");
      await harness.call("chat_upsert_users", { users: [{ id: pushUser, name: "Push User" }] });
      harness.trackUsers(pushUser);

      const checkPushRes = await harness.callEither("app_check_push", {
        user_id: pushUser,
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
      const createStorage = await harness.call("app_create_external_storage", {
        name: storageName,
        storage_type: "s3",
        bucket: "mcp-nonexistent-test-bucket",
        aws_s3: { s3_region: "us-east-1" },
      });
      harness.onCleanup(async () => {
        await harness.callEither("app_delete_external_storage", {
          name: storageName,
        });
      });
      expect(createStorage.duration).toBeDefined();

      await eventually(
        () => harness.call("app_list_external_storage", {}),
        (s) => Boolean(s.external_storages?.[storageName]),
        "external storage creation"
      );

      const updateStorage = await harness.call("app_update_external_storage", {
        name: storageName,
        storage_type: "s3",
        bucket: "mcp-nonexistent-test-bucket-2",
        aws_s3: { s3_region: "us-east-1" },
      });
      expect(updateStorage.duration).toBeDefined();

      await eventually(
        () => harness.call("app_list_external_storage", {}),
        (s) => s.external_storages?.[storageName]?.bucket === "mcp-nonexistent-test-bucket-2",
        "external storage update"
      );

      const checkStorage = await harness.callEither("app_check_external_storage", {
        name: storageName,
      });
      expect(checkStorage.text).not.toMatch(SCHEMA_ERROR);

      const deleteStorage = await harness.call("app_delete_external_storage", {
        name: storageName,
      });
      expect(deleteStorage.duration).toBeDefined();
    }
  );

  it("reads all MCP resources and prompts against the live API", { timeout: 45_000 }, async () => {
    const { resources } = await harness.listResources();
    expect(resources.map((r) => r.uri)).toEqual(
      expect.arrayContaining([
        "stream://app/settings",
        "stream://app/rate-limits",
        "stream://chat/channel-types",
        "stream://video/call-types",
        "stream://moderation/blocklists",
      ])
    );

    const { resourceTemplates } = await harness.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate)).toEqual(
      expect.arrayContaining([
        "stream://chat/channel-types/{name}",
        "stream://video/call-types/{name}",
      ])
    );

    const appSettings = await harness.readResource("stream://app/settings");
    expect(appSettings.app.name).toBeDefined();
    expect(appSettings.app.sns_secret).toBeUndefined();
    expect(appSettings.app.sqs_secret).toBeUndefined();

    const rateLimits = await harness.readResource("stream://app/rate-limits");
    expect(rateLimits.server_side).toBeDefined();

    const channelTypes = await harness.readResource("stream://chat/channel-types");
    expect(channelTypes.channel_types.map((t: any) => t.name)).toContain("messaging");

    const messagingType = await harness.readResource("stream://chat/channel-types/messaging");
    expect(messagingType.name).toBe("messaging");
    expect(messagingType.grants).toBeDefined();

    const callTypes = await harness.readResource("stream://video/call-types");
    expect(callTypes.call_types.map((t: any) => t.name)).toContain("default");

    const defaultCallType = await harness.readResource("stream://video/call-types/default");
    expect(defaultCallType.name).toBe("default");
    expect(defaultCallType.grants).toBeDefined();

    const blocklists = await harness.readResource("stream://moderation/blocklists");
    expect(Array.isArray(blocklists.blocklists)).toBe(true);

    const { prompts } = await harness.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      "call-quality-debug",
      "channel-incident-debug",
      "moderation-triage",
      "rate-limit-diagnosis",
    ]);

    const triage = await harness.getPrompt("moderation-triage", {
      entity_type: "stream:chat:v1:message",
      limit: "10",
    });
    expect(JSON.stringify(triage.messages)).toContain("moderation_query_review_queue");

    const callDebug = await harness.getPrompt("call-quality-debug", {
      call_type: "default",
      call_id: "test-call",
      session_id: "sess-1",
    });
    expect(JSON.stringify(callDebug.messages)).toContain("default:test-call");

    const channelDebug = await harness.getPrompt("channel-incident-debug", {
      channel_type: "messaging",
      channel_id: "general",
    });
    expect(JSON.stringify(channelDebug.messages)).toContain("messaging:general");

    const rateLimitPrompt = await harness.getPrompt("rate-limit-diagnosis", {
      endpoints: "SendMessage,QueryChannels",
    });
    expect(JSON.stringify(rateLimitPrompt.messages)).toContain("SendMessage,QueryChannels");
  });
});
