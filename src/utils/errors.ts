interface StreamApiError extends Error {
  status?: number;
  code?: number;
}

function isStreamApiError(error: unknown): error is StreamApiError {
  return (
    error instanceof Error &&
    ("status" in error || "code" in error)
  );
}

export function formatErrorMessage(error: unknown): string {
  if (isStreamApiError(error)) {
    return `Stream API Error (${error.status ?? "unknown"}): ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
