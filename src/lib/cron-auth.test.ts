import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyCronAuth } from "./cron-auth";

function withEnv<T>(
  patch: Record<string, string | undefined>,
  fn: () => T
): T {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    original[key] = process.env[key];
    if (patch[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = patch[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/test", { headers });
}

test("rejects with 401 when CRON_SECRET is set and header is missing", async () => {
  await withEnv({ CRON_SECRET: "topsecret" }, async () => {
    const result = verifyCronAuth(makeRequest());
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 401);
    }
  });
});

test("rejects with 401 when Authorization header is the wrong scheme", async () => {
  await withEnv({ CRON_SECRET: "topsecret" }, async () => {
    const result = verifyCronAuth(
      makeRequest({ Authorization: "Basic topsecret" })
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 401);
    }
  });
});

test("rejects with 401 when Bearer token does not match", async () => {
  await withEnv({ CRON_SECRET: "topsecret" }, async () => {
    const result = verifyCronAuth(
      makeRequest({ Authorization: "Bearer wrong-secret" })
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 401);
    }
  });
});

test("accepts when Bearer token matches exactly", async () => {
  await withEnv({ CRON_SECRET: "topsecret" }, async () => {
    const result = verifyCronAuth(
      makeRequest({ Authorization: "Bearer topsecret" })
    );
    assert.equal(result.ok, true);
  });
});

test("fails closed with 500 in production when CRON_SECRET is missing", async () => {
  await withEnv(
    { CRON_SECRET: undefined, NODE_ENV: "production" },
    async () => {
      const result = verifyCronAuth(makeRequest());
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(
          result.response.status,
          500,
          "production must refuse to run an unauthenticated cron"
        );
      }
    }
  );
});

test("allows missing CRON_SECRET in development for local convenience", async () => {
  await withEnv(
    { CRON_SECRET: undefined, NODE_ENV: "development" },
    async () => {
      const result = verifyCronAuth(makeRequest());
      assert.equal(result.ok, true);
    }
  );
});

test("allows missing CRON_SECRET in test env", async () => {
  await withEnv(
    { CRON_SECRET: undefined, NODE_ENV: "test" },
    async () => {
      const result = verifyCronAuth(makeRequest());
      assert.equal(result.ok, true);
    }
  );
});

test("env-var lookup is dynamic, not module-load-time", async () => {
  // First call: no secret → ok in dev
  const result1 = await withEnv(
    { CRON_SECRET: undefined, NODE_ENV: "development" },
    () => verifyCronAuth(makeRequest())
  );
  assert.equal(result1.ok, true);

  // Second call in the same process: secret now set → require Bearer
  const result2 = await withEnv({ CRON_SECRET: "freshly-set" }, () =>
    verifyCronAuth(makeRequest())
  );
  assert.equal(result2.ok, false);

  const result3 = await withEnv({ CRON_SECRET: "freshly-set" }, () =>
    verifyCronAuth(makeRequest({ Authorization: "Bearer freshly-set" }))
  );
  assert.equal(result3.ok, true);
});
