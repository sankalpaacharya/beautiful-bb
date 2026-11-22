import assert from "node:assert/strict";
import test from "node:test";
import { pooledWeeklyUsage, uniqueWeeklyAccounts } from "./usage.ts";

const resource = { id: "second", providerId: "claude-code", label: "Account 2", accountKey: "anthropic:second" };
const measurement = {
  accountKey: resource.accountKey,
  usage: {
    status: "ok",
    accountEmail: "second@example.com",
    windows: [
      { kind: "weekly", model: "opus", usedPercent: 99, resetsAt: "2026-11-25T00:00:00Z" },
      { kind: "weekly", model: null, usedPercent: 23, resetsAt: "2026-11-26T00:00:00Z" },
      { kind: "five-hour", model: null, usedPercent: 5, resetsAt: "2026-11-21T15:20:00Z" },
    ],
  },
};

function pool({ enabled = true, resources = [resource], measure = () => measurement } = {}) {
  const warnings = [];
  return {
    sdk: {
      plugins: {
        list: async () => ({ plugins: [{ id: "account-pool", enabled }] }),
        callRpc: async ({ method, input, outputSchema }) => outputSchema.parse(
          method === "provider-usage.v1.listResources" ? { resources } : await measure(input.resourceId),
        ),
      },
    },
    log: { warn: (message) => warnings.push(message) },
    warnings,
  };
}

test("a pooled account shows its overall weekly and 5-hour quotas and identity", async () => {
  const rows = await pooledWeeklyUsage(pool());
  assert.deepEqual(rows, [{
    id: "account-pool:second",
    providerId: "claude-code",
    name: "Claude",
    accountKey: "anthropic:second",
    accountLabel: "second@example.com",
    plan: null,
    usedPercent: 23,
    resetsAt: "2026-11-26T00:00:00Z",
    fiveHour: { usedPercent: 5, resetsAt: "2026-11-21T15:20:00Z" },
  }]);
});

test("an account without a 5-hour reading gets no 5-hour line", async () => {
  const weeklyOnly = { ...measurement, usage: { ...measurement.usage, windows: measurement.usage.windows.slice(0, 2) } };
  const [row] = await pooledWeeklyUsage(pool({ measure: () => weeklyOnly }));
  assert.equal(row.fiveHour, null);
});

test("one account failing to refresh leaves other accounts visible", async () => {
  const bb = pool({
    resources: [{ ...resource, id: "broken" }, resource],
    measure: (id) => {
      if (id === "broken") throw new Error("unavailable");
      return measurement;
    },
  });
  assert.equal((await pooledWeeklyUsage(bb)).length, 1);
  assert.equal(bb.warnings.length, 1);
});

test("disabled pools and expired logins do not produce misleading quota rows", async () => {
  assert.deepEqual(await pooledWeeklyUsage(pool({ enabled: false })), []);
  assert.deepEqual(await pooledWeeklyUsage(pool({ measure: () => ({ accountKey: null, usage: { status: "expired" } }) })), []);
});

test("the same native and pooled account appears once; distinct and unknown accounts stay separate", async () => {
  const [pooled] = await pooledWeeklyUsage(pool());
  const local = { ...pooled, id: "claude-code" };
  const other = { ...pooled, id: "third", accountKey: "anthropic:third" };
  const unknownLocal = { ...local, accountKey: null };
  const unknownPool = { ...pooled, accountKey: null };
  assert.deepEqual(uniqueWeeklyAccounts([local, pooled, other, unknownLocal, unknownPool]), [local, other, unknownLocal, unknownPool]);
});

test("identical account keys from different providers are not combined", async () => {
  const [claude] = await pooledWeeklyUsage(pool());
  const codex = { ...claude, providerId: "codex", id: "codex" };
  assert.deepEqual(uniqueWeeklyAccounts([claude, codex]), [claude, codex]);
});

test("plans read as their names, with the Max tier", async () => {
  const withPlan = (plan, planLabel) => ({ ...measurement, usage: { ...measurement.usage, plan, planLabel } });
  const planOf = async (plan, planLabel) => (await pooledWeeklyUsage(pool({ measure: () => withPlan(plan, planLabel) })))[0].plan;
  assert.equal(await planOf({ id: "ultra", multiplier: null }, "Ultra"), "Max 20x");
  assert.equal(await planOf({ id: "max", multiplier: null }, "Max"), "Max 5x");
  assert.equal(await planOf({ id: "plus", multiplier: null }, "Plus"), "Plus");
  assert.equal(await planOf(null, null), null);
});
