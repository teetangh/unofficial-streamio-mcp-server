import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateCall } from "./create-call.js";
import { registerGetCall } from "./get-call.js";
import { registerUpdateCall } from "./update-call.js";
import { registerEndCall } from "./end-call.js";
import { registerQueryCalls } from "./query-calls.js";
import { registerStartRecording } from "./start-recording.js";
import { registerStopRecording } from "./stop-recording.js";
import { registerListRecordings } from "./list-recordings.js";
import { registerStartTranscription } from "./start-transcription.js";
import { registerStopTranscription } from "./stop-transcription.js";
import { registerListTranscriptions } from "./list-transcriptions.js";
import { registerUpdateCallMembers } from "./update-call-members.js";
import { registerQueryCallMembers } from "./query-call-members.js";
import { registerBlockUser } from "./block-user.js";
import { registerUnblockUser } from "./unblock-user.js";
import { registerMuteUsers } from "./mute-users.js";

export function registerVideoTools(server: McpServer): void {
  registerCreateCall(server);
  registerGetCall(server);
  registerUpdateCall(server);
  registerEndCall(server);
  registerQueryCalls(server);
  registerStartRecording(server);
  registerStopRecording(server);
  registerListRecordings(server);
  registerStartTranscription(server);
  registerStopTranscription(server);
  registerListTranscriptions(server);
  registerUpdateCallMembers(server);
  registerQueryCallMembers(server);
  registerBlockUser(server);
  registerUnblockUser(server);
  registerMuteUsers(server);
}
