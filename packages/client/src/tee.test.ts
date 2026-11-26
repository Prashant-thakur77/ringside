import { test } from "node:test";
import assert from "node:assert/strict";
import { teeUrlWithToken, wsUrl } from "./tee.ts";

test("only the token string is put in the URL", () => {
  const url = teeUrlWithToken("https://devnet-tee.magicblock.app", { token: "abc123", expiresAt: 1 });
  assert.equal(url, "https://devnet-tee.magicblock.app/?token=abc123");
  assert.ok(!url.includes("object"));
});

test("rejects an empty or non-string token", () => {
  assert.throws(() => teeUrlWithToken("https://x", { token: "", expiresAt: 0 }));
  assert.throws(() => teeUrlWithToken("https://x", { token: {} as unknown as string, expiresAt: 0 }));
});

test("ws url keeps the token", () => {
  assert.equal(wsUrl("https://h/?token=t"), "wss://h/?token=t");
});
