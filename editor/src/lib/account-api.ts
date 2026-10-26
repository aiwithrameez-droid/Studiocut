export type CurrentUserProfile = {
  email: string;
  displayName: string;
  phoneNumber: string | null;
  profileComplete: boolean;
  isAdmin: boolean;
};

export type StudioCutUsageEvent =
  | "projects_opened"
  | "editor_opened"
  | "project_created"
  | "support_opened";

export class StudioCutApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "StudioCutApiError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = "StudioCut could not complete that request.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the generic message if the server did not return JSON.
    }
    throw new StudioCutApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export async function fetchCurrentUserProfile(): Promise<CurrentUserProfile> {
  const response = await fetch("/api/users/me", {
    credentials: "same-origin",
  });
  return readJson<CurrentUserProfile>(response);
}

export async function saveCurrentUserProfile(input: {
  phoneNumber: string;
  privacyConsent: true;
}): Promise<CurrentUserProfile> {
  const response = await fetch("/api/users/profile", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<CurrentUserProfile>(response);
}

export function recordUsageEvent(eventType: StudioCutUsageEvent): void {
  void fetch("/api/analytics/events", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventType }),
  }).catch(() => {
    // Usage reporting is best-effort and must never interrupt editing.
  });
}
