import type { StreamClient } from "@stream-io/node-sdk";
import { z } from "zod";
import { defined } from "../../schemas/common.js";
import { bounded } from "../../utils/format.js";
import { defineTool, type AnyToolDef } from "../define.js";
import { sanitizePushProvider } from "./app.js";

type ListPushProvidersResult = Awaited<ReturnType<StreamClient["listPushProviders"]>>;
type UpsertPushProviderResult = Awaited<ReturnType<StreamClient["upsertPushProvider"]>>;

const pushProviderTypeEnum = z
  .enum(["apn", "firebase", "huawei", "xiaomi"])
  .describe("Push notification provider type");

function redactPushProvidersResponse(response: ListPushProvidersResult): ListPushProvidersResult {
  return {
    ...response,
    push_providers: (response.push_providers ?? []).map((provider) =>
      sanitizePushProvider(provider)
    ),
  };
}

function redactPushProviderResponse(response: UpsertPushProviderResult): UpsertPushProviderResult {
  return {
    ...response,
    ...(response.push_provider
      ? { push_provider: sanitizePushProvider(response.push_provider) }
      : {}),
  };
}

const externalStorageFields = {
  name: z.string().min(1).describe("Unique name for the external storage configuration"),
  storage_type: z
    .enum(["s3", "gcs", "abs"])
    .describe("Cloud storage provider type: s3, gcs, or abs"),
  bucket: z.string().min(1).describe("Bucket or container name on the storage provider"),
  path: z.string().optional().describe("Key prefix path inside the bucket for stored files"),
  gcs_credentials: z
    .string()
    .optional()
    .describe("Google Cloud Storage service account JSON credentials string"),
  aws_s3: z
    .object({
      s3_region: z.string().describe("AWS region"),
      s3_api_key: z.string().optional().describe("AWS access key ID"),
      s3_secret: z.string().optional().describe("AWS secret access key"),
    })
    .optional()
    .describe(
      "Amazon S3 region and optional credentials (omit s3_api_key and s3_secret to use IAM role authentication)"
    ),
  azure_blob: z
    .object({
      abs_account_name: z.string().describe("Azure storage account"),
      abs_client_id: z.string().describe("Azure client ID"),
      abs_client_secret: z.string().describe("Azure client secret"),
      abs_tenant_id: z.string().describe("Azure tenant ID"),
    })
    .optional()
    .describe("Azure Blob Storage account credentials"),
};

const listRoles = defineTool({
  name: "app_list_roles",
  title: "List roles",
  toolset: "app",
  description: "List all built-in and custom roles defined in the Stream application.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {},
  handler: async (_args, client) => client.listRoles(),
});

const createRole = defineTool({
  name: "app_create_role",
  title: "Create custom role",
  toolset: "app",
  description:
    "Create a new custom role in the Stream application that can be assigned to users or members.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Name of the custom role to create"),
  },
  handler: async (args, client) => client.createRole({ name: args.name }),
});

const deleteRole = defineTool({
  name: "app_delete_role",
  title: "Delete custom role",
  toolset: "app",
  description:
    "Delete a custom role from the Stream application by its name. Built-in roles cannot be deleted.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Name of the custom role to delete"),
  },
  handler: async (args, client) => client.deleteRole({ name: args.name }),
});

const listPermissions = defineTool({
  name: "app_list_permissions",
  title: "List permissions",
  toolset: "app",
  description:
    "List all available permissions in the Stream application that can be granted to roles.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: bounded,
  inputSchema: {},
  handler: async (_args, client) => client.listPermissions(),
});

const getPermission = defineTool({
  name: "app_get_permission",
  title: "Get permission",
  toolset: "app",
  description:
    "Retrieve details of a specific permission by its ID, including its condition and action definition.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {
    id: z.string().min(1).describe("Permission ID to retrieve"),
  },
  handler: async (args, client) => client.getPermission({ id: args.id }),
});

const listPushProviders = defineTool({
  name: "app_list_push_providers",
  title: "List push providers",
  toolset: "app",
  description:
    "List all configured push notification providers (APN, Firebase, Huawei, or Xiaomi) on the app.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: (raw: ListPushProvidersResult) => ({
    push_providers: (raw.push_providers ?? []).map((provider) => sanitizePushProvider(provider)),
  }),
  inputSchema: {},
  handler: async (_args, client) => redactPushProvidersResponse(await client.listPushProviders()),
});

const upsertPushProvider = defineTool({
  name: "app_upsert_push_provider",
  title: "Create or update push provider",
  toolset: "app",
  description:
    "Create or replace a named push notification provider configuration (APN, Firebase, Huawei, or Xiaomi).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: (raw: UpsertPushProviderResult) => ({
    push_provider: raw.push_provider ? sanitizePushProvider(raw.push_provider) : undefined,
  }),
  inputSchema: {
    type: pushProviderTypeEnum,
    name: z.string().min(1).describe("Unique name for this push provider configuration"),
    description: z.string().optional().describe("Human-readable description of the push provider"),
    disabled_at: z.iso
      .datetime({ offset: true })
      .optional()
      .describe("ISO-8601 timestamp if the provider is disabled"),
    disabled_reason: z.string().optional().describe("Reason the push provider was disabled"),
    firebase_credentials: z
      .string()
      .optional()
      .describe("Firebase service account credentials JSON string"),
    apn_auth_key: z.string().optional().describe("APNs .p8 authentication key content"),
    apn_key_id: z.string().optional().describe("APNs key ID"),
    apn_team_id: z.string().optional().describe("Apple developer team ID"),
    apn_topic: z.string().optional().describe("APNs bundle identifier / topic"),
    apn_development: z
      .boolean()
      .optional()
      .describe("Whether to use the APNs development/sandbox environment"),
    huawei_app_id: z.string().optional().describe("Huawei Push Kit application ID"),
    huawei_app_secret: z.string().optional().describe("Huawei Push Kit application secret"),
    xiaomi_package_name: z.string().optional().describe("Xiaomi application package name"),
    xiaomi_app_secret: z.string().optional().describe("Xiaomi Push application secret"),
  },
  handler: async (args, client) =>
    redactPushProviderResponse(
      await client.upsertPushProvider({
        push_provider: defined({
          type: args.type,
          name: args.name,
          description: args.description,
          disabled_at: args.disabled_at ? new Date(args.disabled_at) : undefined,
          disabled_reason: args.disabled_reason,
          firebase_credentials: args.firebase_credentials,
          apn_auth_key: args.apn_auth_key,
          apn_key_id: args.apn_key_id,
          apn_team_id: args.apn_team_id,
          apn_topic: args.apn_topic,
          apn_development: args.apn_development,
          huawei_app_id: args.huawei_app_id,
          huawei_app_secret: args.huawei_app_secret,
          xiaomi_package_name: args.xiaomi_package_name,
          xiaomi_app_secret: args.xiaomi_app_secret,
        }),
      })
    ),
});

const deletePushProvider = defineTool({
  name: "app_delete_push_provider",
  title: "Delete push provider",
  toolset: "app",
  description:
    "Delete a named push notification provider configuration from the Stream application.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: pushProviderTypeEnum,
    name: z.string().min(1).describe("Push provider name to delete"),
  },
  handler: async (args, client) => client.deletePushProvider({ type: args.type, name: args.name }),
});

const checkPush = defineTool({
  name: "app_check_push",
  title: "Check push notifications",
  toolset: "app",
  description:
    "Test push notification delivery and template rendering for a user or message across configured push providers. Delivers real push notifications to the user's devices unless skip_devices is true.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    user_id: z
      .string()
      .min(1)
      .describe("User ID whose devices to test push delivery against (required by Stream)"),
    message_id: z.string().optional().describe("Message ID to render and test push payload for"),
    push_provider_type: pushProviderTypeEnum.optional(),
    push_provider_name: z.string().optional().describe("Named push provider configuration to test"),
    skip_devices: z
      .boolean()
      .optional()
      .describe("Skip device lookup and only validate template rendering"),
    event_type: z
      .enum([
        "message.new",
        "message.updated",
        "reaction.new",
        "reaction.updated",
        "notification.reminder_due",
      ])
      .optional()
      .describe("Event type to render push template for"),
  },
  handler: async (args, client) =>
    client.checkPush(
      defined({
        user_id: args.user_id,
        message_id: args.message_id,
        push_provider_type: args.push_provider_type,
        push_provider_name: args.push_provider_name,
        skip_devices: args.skip_devices,
        event_type: args.event_type,
      })
    ),
});

const verifyWebhook = defineTool({
  name: "app_verify_webhook",
  title: "Verify webhook signature",
  toolset: "app",
  description:
    "Verify the HMAC-SHA256 X-Signature header of an incoming Stream webhook payload against the app's API secret.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    raw_body: z.string().min(1).describe("Raw HTTP request body string signed by Stream"),
    signature: z.string().min(1).describe("Hex signature from the X-Signature HTTP header"),
  },
  handler: async (args, client) => {
    const valid = client.verifyWebhook(args.raw_body, args.signature);
    return { valid };
  },
});

const listExternalStorage = defineTool({
  name: "app_list_external_storage",
  title: "List external storage",
  toolset: "app",
  description:
    "List all external storage buckets (S3, GCS, Azure Blob) configured on the Stream application.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  compact: false,
  inputSchema: {},
  handler: async (_args, client) => client.listExternalStorage(),
});

const createExternalStorage = defineTool({
  name: "app_create_external_storage",
  title: "Create external storage",
  toolset: "app",
  description:
    "Register an external cloud storage bucket (AWS S3, Google Cloud Storage, or Azure Blob) for recordings and exports.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: externalStorageFields,
  handler: async (args, client) =>
    client.createExternalStorage(
      defined({
        name: args.name,
        storage_type: args.storage_type,
        bucket: args.bucket,
        path: args.path,
        gcs_credentials: args.gcs_credentials,
        aws_s3: args.aws_s3 ? defined(args.aws_s3) : undefined,
        azure_blob: args.azure_blob,
      })
    ),
});

const updateExternalStorage = defineTool({
  name: "app_update_external_storage",
  title: "Update external storage",
  toolset: "app",
  description:
    "Replace an existing external cloud storage configuration (AWS S3, GCS, or Azure Blob) by name.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: externalStorageFields,
  handler: async (args, client) =>
    client.updateExternalStorage(
      defined({
        name: args.name,
        storage_type: args.storage_type,
        bucket: args.bucket,
        path: args.path,
        gcs_credentials: args.gcs_credentials,
        aws_s3: args.aws_s3 ? defined(args.aws_s3) : undefined,
        azure_blob: args.azure_blob,
      })
    ),
});

const deleteExternalStorage = defineTool({
  name: "app_delete_external_storage",
  title: "Delete external storage",
  toolset: "app",
  description:
    "Delete an external cloud storage configuration from the Stream application by its name.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Name of the external storage configuration to delete"),
  },
  handler: async (args, client) => client.deleteExternalStorage({ name: args.name }),
});

const checkExternalStorage = defineTool({
  name: "app_check_external_storage",
  title: "Check external storage",
  toolset: "app",
  description:
    "Test connectivity and write permissions for a configured external storage bucket by its name.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    name: z.string().min(1).describe("Name of the external storage configuration to test"),
  },
  handler: async (args, client) => client.checkExternalStorage({ name: args.name }),
});

export const platformTools: AnyToolDef[] = [
  listRoles,
  createRole,
  deleteRole,
  listPermissions,
  getPermission,
  listPushProviders,
  upsertPushProvider,
  deletePushProvider,
  checkPush,
  verifyWebhook,
  listExternalStorage,
  createExternalStorage,
  updateExternalStorage,
  deleteExternalStorage,
  checkExternalStorage,
];
