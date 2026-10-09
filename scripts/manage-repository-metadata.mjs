import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const CATALOG_PATH = new URL("../config/public-repository-metadata.json", import.meta.url);
const API_BASE = "https://api.github.com";
const OWNER = "EliteMay";
const CONFIRMATION = "APPLY_METADATA";
const PRIVATE_DENYLIST = new Set(["chatgpt-workspace", "web-project-data"]);
const TOPIC = /^[a-z0-9][a-z0-9-]{0,49}$/;
const REPO = /^[a-zA-Z0-9_.-]{1,100}$/;

export function validateCatalog(catalog) {
  if (catalog?.owner !== OWNER || catalog?.scope !== "public-only" || !Array.isArray(catalog.repositories) || catalog.repositories.length === 0) {
    throw new Error("Catalog must contain public-only EliteMay repositories");
  }
  const names = new Set();
  for (const entry of catalog.repositories) {
    if (!entry || !REPO.test(entry.name) || PRIVATE_DENYLIST.has(entry.name.toLowerCase()) || names.has(entry.name.toLowerCase())) {
      throw new Error("Duplicate, private, or invalid repository in catalog");
    }
    names.add(entry.name.toLowerCase());
    if (typeof entry.description !== "string" || !entry.description.trim() || entry.description.length > 350 || /[\r\n]/.test(entry.description)) {
      throw new Error("Missing or invalid repository description: " + entry.name);
    }
    if (!Array.isArray(entry.topics) || entry.topics.length < 1 || entry.topics.length > 20 ||
        new Set(entry.topics).size !== entry.topics.length || !entry.topics.every(t => typeof t === "string" && TOPIC.test(t))) {
      throw new Error("Invalid topics: " + entry.name);
    }
  }
  return catalog.repositories;
}

export function selectRepositories(catalog, scope = ".github") {
  const entries = validateCatalog(catalog);
  if (scope === "all") return entries;
  if (!REPO.test(scope)) throw new Error("Invalid repository scope");
  const chosen = entries.find(entry => entry.name === scope);
  if (!chosen) throw new Error("Scope not in reviewed public catalog: " + scope);
  return [chosen];
}

export function planOne(entry, repo, currentTopics) {
  if (!repo || repo.name !== entry.name || repo.owner?.login !== OWNER || repo.private !== false ||
      repo.visibility !== "public" || repo.archived) {
    throw new Error("Repository identity/visibility changed, refusing: " + entry.name);
  }
  if (!Array.isArray(currentTopics) || !currentTopics.every(t => typeof t === "string" && TOPIC.test(t))) {
    throw new Error("Invalid GitHub topic response: " + entry.name);
  }
  const already = new Set(currentTopics.map(s => s.toLowerCase()));
  const merged = currentTopics.slice();
  for (const t of entry.topics) if (!already.has(t)) { merged.push(t); already.add(t); }
  if (merged.length > 20) throw new Error("Too many combined topics: " + entry.name);
  const description = !repo.description?.trim() ? entry.description.trim() : null;
  return { name: entry.name, description, topics: merged, addTopics: merged.length > currentTopics.length, existingDescription: repo.description || "" };
}

export async function executeCatalog({ catalog, scope = ".github", api, apply = false, confirmation = "" }) {
  if (apply && confirmation !== CONFIRMATION) throw new Error("Explicit APPLY_METADATA confirmation required");
  const targets = selectRepositories(catalog, scope);
  // Preflight ALL target repositories before the first write. No partial writes on preflight failures.
  const plans = [];
  for (const entry of targets) {
    const repo = await api.getRepo(entry.name);
    const topics = await api.getTopics(entry.name);
    plans.push(planOne(entry, repo, topics));
  }
  if (apply) {
    for (const plan of plans) {
      if (plan.description) await api.updateDescription(plan.name, plan.description);
      if (plan.addTopics) await api.replaceTopics(plan.name, plan.topics);
    }
  }
  return {
    mode: apply ? "APPLIED" : "PLAN ONLY",
    examined: plans.length,
    descriptionAdds: plans.filter(p => p.description).length,
    topicUpdates: plans.filter(p => p.addTopics).length,
    unchanged: plans.filter(p => !p.description && !p.addTopics).length,
    plans
  };
}

export function createGitHubApi(token, fetchImpl = fetch) {
  if (typeof token !== "string" || !token.trim()) throw new Error("Missing GitHub API token");
  async function request(method, repo, suffix = "", body) {
    if (!REPO.test(repo) || PRIVATE_DENYLIST.has(repo.toLowerCase())) throw new Error("Invalid repository request");
    const url = API_BASE + "/repos/" + OWNER + "/" + encodeURIComponent(repo) + suffix;
    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "User-Agent": "EliteMay-repository-metadata"
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) throw new Error(method + " " + OWNER + "/" + repo + suffix + " failed: HTTP " + response.status);
    return response.json();
  }
  return {
    getRepo: name => request("GET", name),
    getTopics: async name => (await request("GET", name, "/topics")).names,
    updateDescription: (name, description) => request("PATCH", name, "", { description }),
    replaceTopics: (name, topics) => request("PUT", name, "/topics", { names: topics })
  };
}

export function formatResult(result) {
  return [
    "## Repository About metadata: " + result.mode,
    "",
    "Scope: **public-only** | Inspected: **" + result.examined + "** | Descriptions to add: **" + result.descriptionAdds + "** | Topic sets to extend: **" + result.topicUpdates + "** | Unchanged: **" + result.unchanged + "**",
    "",
    "| Repository | Add description | Add topics |",
    "| --- | --- | --- |",
    ...result.plans.map(p => "| " + p.name + " | " + (p.description ? "yes" : "no") + " | " + (p.addTopics ? "yes" : "no") + " |"),
    "",
    "Existing nonempty descriptions and already-assigned topics are preserved. Private and archived repositories are never updated.",
    ""
  ].join("\n");
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const apply = process.env.APPLY_METADATA === "true";
  if (apply && (process.env.GITHUB_ACTIONS !== "true" ||
      process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      process.env.GITHUB_REF !== "refs/heads/main")) {
    throw new Error("Write mode is allowed only through a manual workflow dispatch on main");
  }
  const token = apply ? process.env.REPO_METADATA_TOKEN : process.env.GITHUB_TOKEN;
  const api = createGitHubApi(token);
  const result = await executeCatalog({
    catalog,
    scope: process.env.METADATA_SCOPE || ".github",
    api,
    apply,
    confirmation: process.env.METADATA_CONFIRM || ""
  });
  const report = formatResult(result);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report, "utf8");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(e => { console.error(e.message); process.exitCode = 1; });
}
