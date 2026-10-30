import { getCapabilityInventory } from "./capabilities";

const ENV_KEYS = [
  "GITHUB_TOKEN",
  "BRAVE_API_KEY",
  "GOOGLE_REFRESH_TOKEN",
  "CINME_GOOGLE_REFRESH_TOKEN",
  "CLAUDIO_ENABLE_SHELL",
  "CLAUDIO_ENABLE_GOOGLE_WRITE",
  "CLAUDIO_ENABLE_GMAIL_WRITE",
] as const;

const originalEnvironment = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const originalValue = originalEnvironment[key];
    if (originalValue === undefined) delete process.env[key];
    else process.env[key] = originalValue;
  }
});

describe("getCapabilityInventory", () => {
  it("reports only read capabilities when optional integrations are absent", () => {
    for (const key of ENV_KEYS) delete process.env[key];

    const inventory = getCapabilityInventory();

    expect(inventory.counts.mcp_servers).toBe(1);
    expect(inventory.counts.mcp_modules_registered).toBe(4);
    expect(inventory.counts.http_api_only).toBe(4);
    expect(inventory.counts.known_gaps).toBe(1);
    expect(inventory.mcp_modules.find((module) => module.name === "shell")?.status).toBe("disabled");
    expect(inventory.mcp_modules.find((module) => module.name === "github")?.status).toBe("disabled");
  });

  it("detects configured GitHub, Brave and Google modules without exposing values", () => {
    process.env.GITHUB_TOKEN = "test-token";
    process.env.BRAVE_API_KEY = "test-key";
    process.env.GOOGLE_REFRESH_TOKEN = "test-refresh-token";
    process.env.CLAUDIO_ENABLE_SHELL = "true";
    process.env.CLAUDIO_ENABLE_GOOGLE_WRITE = "true";
    process.env.CLAUDIO_ENABLE_GMAIL_WRITE = "true";

    const inventory = getCapabilityInventory();
    const serialized = JSON.stringify(inventory);

    expect(inventory.counts.mcp_modules_registered).toBe(8);
    expect(inventory.mcp_modules.find((module) => module.name === "github")?.status).toBe("registered");
    expect(inventory.mcp_modules.find((module) => module.name === "calendar")?.access).toBe("mixed");
    expect(serialized).not.toContain("test-token");
    expect(serialized).not.toContain("test-key");
    expect(serialized).not.toContain("test-refresh-token");
  });
});
