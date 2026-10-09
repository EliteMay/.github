import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_OWNER = "EliteMay";
const API = "https://api.github.com";

export async function listPublicOwnerRepos(get, owner = DEFAULT_OWNER) {
  const repos = [];
  for (let page = 1; page <= 100; page += 1) {
    const batch = await get(`/users/${encodeURIComponent(owner)}/repos?type=owner&per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error("GitHub user repositories response is not an array");
    for (const repo of batch) {
      if (repo.owner?.login?.toLowerCase() !== owner.toLowerCase() || repo.private || repo.visibility === "private") continue;
      repos.push(repo);
    }
    if (batch.length < 100) return repos.sort((a, b) => a.name.localeCompare(b.name));
  }
  throw new Error("Repository pagination exceeded 100 pages; the audit is incomplete");
}

export async function inspectRepo(get, repo) {
  const base = `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}`;
  const [readme, branch] = await Promise.all([
    get(base + "/readme", { notFound: null }),
    repo.default_branch ? get(base + "/branches/" + encodeURIComponent(repo.default_branch), { notFound: null }) : null
  ]);
  return {
    name: repo.name,
    url: repo.html_url,
    description: Boolean(repo.description?.trim()),
    topics: Array.isArray(repo.topics) && repo.topics.length > 0,
    readme: readme !== null,
    protected: branch && typeof branch.protected === "boolean" ? branch.protected : null,
    archived: Boolean(repo.archived)
  };
}

export function summarize(repos) {
  return {
    total: repos.length,
    descriptionsMissing: repos.filter((r) => !r.description).length,
    topicsMissing: repos.filter((r) => !r.topics).length,
    readmesMissing: repos.filter((r) => !r.readme).length,
    unprotected: repos.filter((r) => r.protected === false && !r.archived).length,
    unknownProtection: repos.filter((r) => r.protected === null).length
  };
}

export function markdownReport(repos, owner = DEFAULT_OWNER) {
  const counts = summarize(repos);
  const report = [
    `# ${owner} public repository audit`,
    "",
    "**Scope: public repositories only.** Private repositories are deliberately excluded; this is not a complete account audit.",
    "Read-only API calls; this report does not change repository settings. A missing description/topic is a finding, not a failed test.",
    "",
    `Repositories: **${counts.total}** | Missing descriptions: **${counts.descriptionsMissing}** | Missing topics: **${counts.topicsMissing}** | Missing README: **${counts.readmesMissing}** | Unprotected active default branches: **${counts.unprotected}** | Protection unknown: **${counts.unknownProtection}**`,
    "",
    "| Repository | Description | Topics | README | Default branch protected |",
    "| --- | --- | --- | --- | --- |"
  ];
  const yn = (ok) => ok ? "yes" : "no";
  for (const repo of repos) {
    const protection = repo.protected === null ? "unknown" : yn(repo.protected);
    const flag = repo.archived ? " (archived)" : "";
    report.push(`| [${repo.name}](${repo.url})${flag} | ${yn(repo.description)} | ${yn(repo.topics)} | ${yn(repo.readme)} | ${protection} |`);
  }
  report.push("", "Notes: 'protected' comes from the branch API; this audit does not inspect rule details or verify CI, releases, or public-site behavior.", "");
  return report.join("\n");
}

export async function audit({ owner = DEFAULT_OWNER, get, concurrency = 4 }) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) throw new Error("concurrency must be 1 to 10");
  const repos = await listPublicOwnerRepos(get, owner);
  const result = new Array(repos.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, repos.length) }, async () => {
    while (next < repos.length) {
      const i = next++;
      result[i] = await inspectRepo(get, repos[i]);
    }
  });
  await Promise.all(workers);
  return markdownReport(result, owner);
}

export function githubGet(token, fetchImpl = fetch) {
  if (!token) throw new Error("Set GITHUB_TOKEN or GH_TOKEN (read-only access is sufficient)");
  return async function get(path, { notFound } = {}) {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid API path");
    const response = await fetchImpl(API + path, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "EliteMay-repository-audit"
      }
    });
    if (response.status === 404 && Object.hasOwn(arguments[1] || {}, "notFound")) return notFound;
    if (!response.ok) throw new Error(`GitHub GET ${path} failed: HTTP ${response.status}`);
    return response.json();
  };
}

async function main() {
  const get = githubGet(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const report = await audit({ owner: process.env.REPOSITORY_OWNER || DEFAULT_OWNER, get });
  process.stdout.write(report + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n", "utf8");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL("file://" + process.argv[1]))) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
