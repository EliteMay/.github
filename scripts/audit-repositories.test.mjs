import assert from "node:assert/strict";
import test from "node:test";
import { audit, githubGet, inspectRepo, listPublicOwnerRepos, markdownReport, summarize } from "./audit-repositories.mjs";

function repo(name, overrides = {}) {
  return {
    name,
    owner: { login: "EliteMay" },
    html_url: `https://github.com/EliteMay/${name}`,
    description: null,
    topics: [],
    private: false,
    visibility: "public",
    default_branch: "main",
    archived: false,
    ...overrides
  };
}

test("public discovery filters private and unrelated owners", async () => {
  const get = async (path) => {
    assert.match(path, /^\/users\/EliteMay\/repos\?/);
    return [repo("a"), repo("secret", { private: true, visibility: "private" }), repo("other", { owner: { login: "someone" } }), repo("b")];
  };
  assert.deepEqual((await listPublicOwnerRepos(get)).map((x) => x.name), ["a", "b"]);
});

test("read-only audit distinguishes missing README and branch protection", async () => {
  const a = repo("one", { description: "Site", topics: ["elite-app"] });
  const b = repo("two");
  const paths = [];
  const get = async (path, options = {}) => {
    paths.push(path);
    if (path.startsWith("/users/")) return [a, b];
    if (path.endsWith("/readme")) return path.includes("/one/") ? { name: "README.md" } : options.notFound;
    if (path.endsWith("/branches/main")) return { protected: path.includes("/one/") };
    throw new Error("Unexpected request " + path);
  };
  const report = await audit({ get, concurrency: 2 });
  assert.ok(report.includes("Repositories: **2**"));
  assert.ok(report.includes("Missing descriptions: **1**"));
  assert.ok(report.includes("Missing topics: **1**"));
  assert.ok(report.includes("Missing README: **1**"));
  assert.ok(report.includes("Unprotected active default branches: **1**"));
  assert.ok(report.includes("[one](https://github.com/EliteMay/one) | yes | yes | yes | yes"));
  assert.ok(report.includes("[two](https://github.com/EliteMay/two) | no | no | no | no"));
  assert.ok(paths.every((p) => p.startsWith("/")));
});

test("unknown protection is not reported as unprotected", async () => {
  const result = await inspectRepo(async (path, options) => {
    if (path.endsWith("/readme")) return options.notFound;
    return null;
  }, repo("empty", { default_branch: null, archived: true }));
  assert.equal(result.protected, null);
  assert.equal(result.readme, false);
  const counts = summarize([result]);
  assert.equal(counts.unprotected, 0);
  assert.equal(counts.unknownProtection, 1);
  assert.match(markdownReport([result]), /unknown/);
});

test("GitHub transport uses GET only and handles explicit 404", async () => {
  const requests = [];
  const get = githubGet("test-placeholder", async (url, opts) => {
    requests.push({ url, method: opts.method, auth: opts.headers.Authorization });
    return { status: 404, ok: false };
  });
  assert.equal(await get("/repos/EliteMay/a/readme", { notFound: null }), null);
  await assert.rejects(get("/repos/EliteMay/a/readme"), /HTTP 404/);
  assert.ok(requests.every((r) => r.method === "GET" && r.auth === "Bearer test-placeholder"));
});

test("invalid token and empty inventory fail clearly", async () => {
  assert.throws(() => githubGet(""), /GITHUB_TOKEN/);
  await assert.rejects(audit({ get: async () => [] }), /No public repositories/);
});
