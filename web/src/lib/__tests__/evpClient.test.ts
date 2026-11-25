import { describe, expect, it, vi } from "vitest";
import { EvpClient, EvpError } from "../ports/navis/evpClient";

const config = {
  baseUrl: "https://evp.example/v3/evp",
  tokenUrl: "https://auth.example/token",
  clientId: "client",
  clientSecret: "secret",
  operator: "POHA",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("EvpClient", () => {
  it("requests a token with client credentials and caches it", async () => {
    let t = 0;
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url) === config.tokenUrl) {
        const body = String(init?.body);
        expect(body).toContain("grant_type=client_credentials");
        expect(body).toContain("client_id=client");
        return json({ access_token: "tok1", expires_in: 14400 });
      }
      return json({ content: [] });
    });
    const client = new EvpClient(config, fetchFn as typeof fetch, () => t);
    expect(await client.getToken()).toBe("tok1");
    t = 3 * 3600_000; // 3h later: still valid
    expect(await client.getToken()).toBe("tok1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("renews the token shortly before it expires", async () => {
    let t = 0;
    let n = 0;
    const fetchFn = vi.fn(async () => json({ access_token: `tok${++n}`, expires_in: 14400 }));
    const client = new EvpClient(config, fetchFn as typeof fetch, () => t);
    await client.getToken();
    t = 14400_000 - 60_000; // 1 minute before expiry: inside the 5-minute margin
    expect(await client.getToken()).toBe("tok2");
  });

  it("builds the query and follows paging cursors", async () => {
    const urls: URL[] = [];
    const fetchFn = vi.fn(async (url: string | URL) => {
      if (String(url) === config.tokenUrl) return json({ access_token: "tok", expires_in: 14400 });
      const u = new URL(String(url));
      urls.push(u);
      return u.searchParams.get("next")
        ? json({ content: [{ unitId: "B" }], paging: {} })
        : json({ content: [{ unitId: "A" }], paging: { next: "cursor1" } });
    });
    const client = new EvpClient(config, fetchFn as typeof fetch);
    const units = await client.query<{ unitId: string }>("inventory/units", {
      predicate: "routing.pod1Id=TWKHH",
      fields: ["unitId", "category"],
    });
    expect(units.map((u) => u.unitId)).toEqual(["A", "B"]);
    expect(urls[0].pathname).toBe("/v3/evp/inventory/units");
    expect(urls[0].searchParams.get("operator")).toBe("POHA");
    expect(urls[0].searchParams.get("predicate")).toBe("routing.pod1Id=TWKHH");
    expect(urls[0].searchParams.get("fields")).toBe("unitId,category");
    expect(urls[1].searchParams.get("next")).toBe("cursor1");
  });

  it("gets a new token and retries once on 401", async () => {
    let n = 0;
    let calls = 0;
    const fetchFn = vi.fn(async (url: string | URL) => {
      if (String(url) === config.tokenUrl) return json({ access_token: `tok${++n}`, expires_in: 14400 });
      calls++;
      return calls === 1 ? json({}, 401) : json({ content: [{ unitId: "A" }] });
    });
    const client = new EvpClient(config, fetchFn as typeof fetch);
    expect(await client.query("inventory/units")).toHaveLength(1);
    expect(n).toBe(2);
  });

  it("throws a clear error for missing settings", () => {
    expect(() => EvpClient.fromEnv({} as NodeJS.ProcessEnv)).toThrow(EvpError);
  });
});

describe("sign-in diagnostics", () => {
  it("includes the login server's reason on failure", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ error: "invalid_client", error_description: "Invalid client or Invalid client credentials" }), { status: 401 }),
    );
    const client = new EvpClient(config, fetchFn as unknown as typeof fetch);
    await expect(client.getToken()).rejects.toThrow("Token request failed (401): invalid_client: Invalid client or Invalid client credentials");
  });

  it("trims stray spaces from settings", async () => {
    let body = "";
    const fetchFn = vi.fn(async (_u: string | URL, init?: RequestInit) => {
      body = String(init?.body);
      return json({ access_token: "t", expires_in: 100 });
    });
    const env = {
      PORT_HOUSTON_EVP_BASE_URL: " https://evp.example/v3/evp ",
      PORT_HOUSTON_EVP_TOKEN_URL: "https://auth.example/token",
      PORT_HOUSTON_EVP_CLIENT_ID: "pha-efficio ",
      PORT_HOUSTON_EVP_CLIENT_SECRET: " s3cret\n",
      PORT_HOUSTON_EVP_OPERATOR: "POHA",
    } as unknown as NodeJS.ProcessEnv;
    const c = EvpClient.fromEnv(env) as unknown as { config: object; fetchFn: unknown };
    (c as { fetchFn: unknown }).fetchFn = fetchFn;
    await (c as unknown as EvpClient).getToken();
    expect(body).toContain("client_id=pha-efficio&client_secret=s3cret&");
  });

  it("describes credentials without revealing the secret", async () => {
    const { describeCredentials } = await import("../ports/navis/evpClient");
    const out = describeCredentials({ PORT_HOUSTON_EVP_CLIENT_ID: "pha-efficio", PORT_HOUSTON_EVP_CLIENT_SECRET: " abcdefgh ", PORT_HOUSTON_EVP_TOKEN_URL: "https://auth.example/token" } as unknown as NodeJS.ProcessEnv).join("\n");
    expect(out).toContain("Client secret: 8 characters (had spaces around it; ignored)");
    expect(out).not.toContain("abcdefgh");
  });
});
