import fs from "node:fs";
import {
  getQuestradeActivities,
  listQuestradeAccounts,
  resetQuestradeRuntimeForTests,
} from "@/lib/questrade";

describe("questrade auth runtime", () => {
  beforeEach(() => {
    resetQuestradeRuntimeForTests();
    delete process.env.QUESTRADE_REFRESH_TOKEN;
    delete process.env.QUESTRADE_IS_PRACTICE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetQuestradeRuntimeForTests();
  });

  it("fails with explicit error when refresh token is missing", async () => {
    await expect(listQuestradeAccounts()).rejects.toThrow(/QUESTRADE_REFRESH_TOKEN is missing/);
  });

  it("reuses rotated refresh token in memory", async () => {
    process.env.QUESTRADE_REFRESH_TOKEN = "initial-token";
    const tokenUrls: string[] = [];

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("oauth2/token")) {
        tokenUrls.push(url);
        return new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "rotated-token",
            expires_in: 0,
            api_server: "https://api01.iq.questrade.com/",
            token_type: "Bearer",
          }),
        );
      }

      if (url.includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [] }));
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    await listQuestradeAccounts();
    await listQuestradeAccounts();

    expect(tokenUrls).toHaveLength(2);
    expect(tokenUrls[0]).toContain("refresh_token=initial-token");
    expect(tokenUrls[1]).toContain("refresh_token=rotated-token");
  });

  it("persists rotated refresh token to .env.local", async () => {
    process.env.QUESTRADE_REFRESH_TOKEN = "initial-token";
    const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const readSpy = vi
      .spyOn(fs, "readFileSync")
      .mockReturnValue("QUESTRADE_REFRESH_TOKEN=initial-token\nQUESTRADE_IS_PRACTICE=false\n" as never);
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "rotated-token",
            expires_in: 1800,
            api_server: "https://api01.iq.questrade.com/",
            token_type: "Bearer",
          }),
        );
      }

      if (url.includes("/v1/accounts")) {
        return new Response(JSON.stringify({ accounts: [] }));
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    await listQuestradeAccounts();

    expect(existsSpy).toHaveBeenCalled();
    expect(readSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining(".env.local"),
      expect.stringContaining("QUESTRADE_REFRESH_TOKEN=rotated-token"),
      "utf8",
    );
    expect(process.env.QUESTRADE_REFRESH_TOKEN).toBe("rotated-token");
  });

  it("chunks activity requests into Questrade-safe windows", async () => {
    process.env.QUESTRADE_REFRESH_TOKEN = "initial-token";
    const activityUrls: string[] = [];

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "rotated-token",
            expires_in: 1800,
            api_server: "https://api01.iq.questrade.com/",
            token_type: "Bearer",
          }),
        );
      }

      if (url.includes("/activities")) {
        activityUrls.push(url);
        return new Response(JSON.stringify({ activities: [] }));
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    await getQuestradeActivities(
      "12345678",
      "2025-01-01T00:00:00.000Z",
      "2025-03-15T00:00:00.000Z",
    );

    expect(activityUrls.length).toBeGreaterThan(1);
    expect(activityUrls[0]).toContain("startTime=2024-12-31T19%3A00%3A00-05%3A00");
    expect(activityUrls[0]).not.toContain(".000Z");
    expect(activityUrls.every((url) => url.includes("endTime="))).toBe(true);
  });
});
