/**
 * Minimal client for the Navis N4 EVP REST API used by Port Houston.
 * Based on the "Getting Data" access document (see docs/integrations/port-houston.md).
 *
 * Auth: OAuth2 client credentials. Tokens last ~4h and cannot be refreshed,
 * so we cache the token and request a new one shortly before it expires.
 */

export interface EvpConfig {
  baseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** Operator code; POHA = Port of Houston Authority. */
  operator: string;
}

export interface EvpPage<T> {
  content: T[];
  paging?: { next?: string | null };
}

export interface EvpQuery {
  /** Filter expression, e.g. "routing.pod1Id=TWKHH". */
  predicate?: string;
  /** Fields to return, e.g. ["unitId", "category"]. */
  fields?: string[];
  /** Safety cap when following paging cursors. */
  maxPages?: number;
}

export class EvpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EvpError";
  }
}

type FetchFn = typeof fetch;

/** Refresh the token this long before it actually expires. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
/** Give up on any single request after this long. */
const REQUEST_TIMEOUT_MS = 20_000;

export class EvpClient {
  private token: { value: string; expiresAt: number } | null = null;
  private pendingToken: Promise<string> | null = null;

  constructor(
    private readonly config: EvpConfig,
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): EvpClient {
    // Trimmed: a stray space pasted into a hosting dashboard would otherwise break sign-in.
    const required = {
      baseUrl: env.PORT_HOUSTON_EVP_BASE_URL?.trim(),
      tokenUrl: env.PORT_HOUSTON_EVP_TOKEN_URL?.trim(),
      clientId: env.PORT_HOUSTON_EVP_CLIENT_ID?.trim(),
      clientSecret: env.PORT_HOUSTON_EVP_CLIENT_SECRET?.trim(),
      operator: env.PORT_HOUSTON_EVP_OPERATOR?.trim(),
    };
    const missing = Object.entries(required)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) {
      throw new EvpError(`Missing Port Houston EVP settings: ${missing.join(", ")}. See .env.example.`);
    }
    return new EvpClient(required as EvpConfig);
  }

  async getToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt - EXPIRY_MARGIN_MS) return this.token.value;
    // Share one in-flight request between concurrent callers.
    this.pendingToken ??= this.requestToken().finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async requestToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "client_credentials",
    });
    const res = await this.fetchFn(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new EvpError(`Token request failed (${res.status})${await tokenErrorReason(res)}`, res.status);
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new EvpError("Token response had no access_token");
    this.token = { value: json.access_token, expiresAt: this.now() + (json.expires_in ?? 300) * 1000 };
    return json.access_token;
  }

  /** GET a collection (e.g. "inventory/units"), following paging cursors. */
  async query<T>(resource: string, q: EvpQuery = {}): Promise<T[]> {
    const results: T[] = [];
    const maxPages = q.maxPages ?? 20;
    let cursor: string | null | undefined;
    let retriedAuth = false;

    for (let page = 0; page < maxPages; ) {
      const url = new URL(`${this.config.baseUrl.replace(/\/$/, "")}/${resource.replace(/^\//, "")}`);
      url.searchParams.set("operator", this.config.operator);
      if (q.predicate) url.searchParams.set("predicate", q.predicate);
      if (q.fields?.length) url.searchParams.set("fields", q.fields.join(","));
      // The exact paging parameter name is unconfirmed (spike S-013).
      if (cursor) url.searchParams.set("next", cursor);

      const res = await this.fetchFn(url, {
        headers: { Authorization: `Bearer ${await this.getToken()}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.status === 401 && !retriedAuth) {
        // Token was revoked or expired early: get a new one and retry this page once.
        this.token = null;
        retriedAuth = true;
        continue;
      }
      if (!res.ok) throw new EvpError(`EVP ${resource} failed (${res.status})`, res.status);

      const json = (await res.json()) as EvpPage<T>;
      results.push(...(json.content ?? []));
      cursor = json.paging?.next;
      page++;
      retriedAuth = false;
      if (!cursor) break;
    }
    return results;
  }
}

/**
 * The login server's own reason (OAuth2 "error" / "error_description", e.g. "invalid_client:
 * Invalid client credentials"). Only those two fields are read, and shortened, so nothing
 * else from the response is ever shown.
 */
async function tokenErrorReason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown; error_description?: unknown };
    const parts = [body.error, body.error_description].filter((x): x is string => typeof x === "string" && x.length > 0);
    return parts.length ? `: ${parts.join(": ").slice(0, 160)}` : "";
  } catch {
    return "";
  }
}

/** Safe facts about the configured credentials, to spot typos without revealing them. */
export function describeCredentials(env: NodeJS.ProcessEnv = process.env): string[] {
  const id = env.PORT_HOUSTON_EVP_CLIENT_ID ?? "";
  const secret = env.PORT_HOUSTON_EVP_CLIENT_SECRET ?? "";
  const spaces = (v: string) => (v !== v.trim() ? " (had spaces around it; ignored)" : "");
  return [
    `   Client ID: ${id.trim() || "(missing)"}${spaces(id)}`,
    `   Client secret: ${secret.trim().length} characters${spaces(secret)}`,
    `   Login address: ${env.PORT_HOUSTON_EVP_TOKEN_URL?.trim() || "(missing)"}`,
  ];
}
