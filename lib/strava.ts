const STRAVA_AUTHORIZE = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN = "https://www.strava.com/api/v3/oauth/token";
const STRAVA_API = "https://www.strava.com/api/v3";

/** Cookie name for the Strava access token (set by OAuth callback). */
export const STRAVA_ACCESS_TOKEN_COOKIE = "strava_access_token";

/** Cookie name for OAuth `state` CSRF validation. */
export const STRAVA_OAUTH_STATE_COOKIE = "strava_oauth_state";

const DEFAULT_SCOPES = ["read", "activity:read_all"].join(",");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getStravaCallbackUrl(): string {
  const base = requireEnv("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
  return `${base}/api/strava/callback`;
}

/**
 * Build Strava’s authorization URL for the web OAuth flow.
 * @see https://developers.strava.com/docs/authentication/
 */
export function buildStravaAuthorizationUrl(state: string): string {
  const clientId = requireEnv("STRAVA_CLIENT_ID");
  const redirectUri = getStravaCallbackUrl();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: DEFAULT_SCOPES,
    state,
  });
  return `${STRAVA_AUTHORIZE}?${params.toString()}`;
}

export type StravaTokenResponse = {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
};

/**
 * Exchange a one-time authorization code for access and refresh tokens.
 */
export async function exchangeStravaCodeForToken(
  code: string
): Promise<StravaTokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv("STRAVA_CLIENT_ID"),
    client_secret: requireEnv("STRAVA_CLIENT_SECRET"),
    code,
    grant_type: "authorization_code",
  });

  const res = await fetch(STRAVA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Strava token exchange failed (${res.status}): ${detail.slice(0, 500)}`
    );
  }

  return res.json() as Promise<StravaTokenResponse>;
}

/** Summary activity fields returned by `GET /athlete/activities`. */
export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number | null;
  average_speed: number;
  max_speed: number;
  has_heartrate?: boolean;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  calories?: number | null;
  kilojoules?: number | null;
  average_cadence?: number | null;
  /** Present on many activities; includes encoded GPS for the route preview. */
  map?: {
    id?: string;
    summary_polyline?: string;
    resource_state?: number;
  };
};

/**
 * Fetch the authenticated athlete’s recent activities.
 */
export async function fetchStravaActivities(
  accessToken: string,
  perPage = 10
): Promise<StravaActivity[]> {
  const url = new URL(`${STRAVA_API}/athlete/activities`);
  url.searchParams.set("per_page", String(perPage));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Strava activities request failed (${res.status}): ${detail.slice(0, 500)}`
    );
  }

  return res.json() as Promise<StravaActivity[]>;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  return `${(meters / 1000).toFixed(2)} km`;
}

/** Strava speeds are m/s; display km/h. */
export function formatSpeedMps(mps: number): string {
  if (!Number.isFinite(mps) || mps <= 0) return "—";
  return `${(mps * 3.6).toFixed(1)} km/h`;
}

export function formatElevationMeters(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  return `${Math.round(meters)} m`;
}

export function formatHeartRate(bpm: number | null | undefined): string {
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return "—";
  return `${Math.round(bpm)} bpm`;
}

export function formatCalories(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  return `${Math.round(value)} kcal`;
}

export function formatCadence(rpm: number | null | undefined): string {
  if (rpm == null || !Number.isFinite(rpm) || rpm <= 0) return "—";
  return `${Math.round(rpm)} rpm`;
}
