import fs from "node:fs";

const token = (process.env.PROJECT_PAT || "").trim();
const owner = (process.env.PROJECT_OWNER || "EliteMay").trim();
const projectNumber = Number.parseInt(process.env.PROJECT_NUMBER || "4", 10);
const dryRun = String(process.env.DRY_RUN || "false").toLowerCase() === "true";

function writeSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

if (!token) {
  console.log("PROJECT_PAT is not configured. Project sync is a safe no-op.");
  writeSummary([
    "## EliteMay Development project sync",
    "",
    "`PROJECT_PAT` is not configured, so no project data was changed."
  ]);
  process.exit(0);
}

if (!Number.isInteger(projectNumber) || projectNumber < 1) {
  throw new Error(`Invalid PROJECT_NUMBER: ${process.env.PROJECT_NUMBER}`);
}

async function graphql(query, variables = {}) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "EliteMay-project-sync"
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    const details = payload.errors?.map((error) => error.message).join("; ") || response.statusText;
    throw new Error(`GitHub GraphQL request failed: ${details}`);
  }
  return payload.data;
}

async function getProject() {
  const data = await graphql(
    `query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          id
          title
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
            }
          }
        }
      }
    }`,
    { login: owner, number: projectNumber }
  );

  const project = data.user?.projectV2;
  if (!project) {
    throw new Error(`User project not found: ${owner} / project #${projectNumber}`);
  }

  const fields = new Map(
    project.fields.nodes
      .filter((field) => field?.name)
      .map((field) => [field.name, field])
  );

  return { ...project, fields };
}

async function getTrackedContentIds() {
  const tracked = new Set();
  let cursor = null;

  do {
    const data = await graphql(
      `query($login: String!, $number: Int!, $after: String) {
        user(login: $login) {
          projectV2(number: $number) {
            items(first: 100, after: $after) {
              nodes {
                content {
                  ... on Issue { id }
                  ... on PullRequest { id }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }`,
      { login: owner, number: projectNumber, after: cursor }
    );

    const items = data.user?.projectV2?.items;
    if (!items) break;
    for (const item of items.nodes) {
      if (item.content?.id) tracked.add(item.content.id);
    }
    cursor = items.pageInfo.hasNextPage ? items.pageInfo.endCursor : null;
  } while (cursor);

  return tracked;
}

async function getOpenIssues() {
  const issues = [];
  let cursor = null;
  const searchQuery = `user:${owner} is:issue is:open`;

  do {
    const data = await graphql(
      `query($search: String!, $after: String) {
        search(query: $search, type: ISSUE, first: 100, after: $after) {
          nodes {
            ... on Issue {
              id
              number
              title
              url
              body
              repository { nameWithOwner }
              labels(first: 20) { nodes { name } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { search: searchQuery, after: cursor }
    );

    for (const node of data.search.nodes) {
      if (node?.id && node?.repository?.nameWithOwner) issues.push(node);
    }
    cursor = data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null;
  } while (cursor);

  return issues;
}

function normalizedLabels(issue) {
  return new Set((issue.labels?.nodes || []).map((label) => label.name.toLowerCase()));
}

function inferTaskType(issue) {
  const title = issue.title.toLowerCase();
  const labels = normalizedLabels(issue);

  if (title.startsWith("[bug]") || labels.has("bug")) return "Bug";
  if (
    title.startsWith("[improve]") ||
    labels.has("enhancement") ||
    labels.has("improvement") ||
    labels.has("feature")
  ) return "Improvement";
  if (
    title.startsWith("[research]") ||
    labels.has("research") ||
    labels.has("investigation") ||
    /\b(research|investigat(e|ion))\b|調査/.test(title)
  ) return "Research";
  return "Maintenance";
}

function getIssueFormUserTestChoice(body = "") {
  const match = body.match(/###\s+User Testが必要そうか\s*\n+\s*([^\n]+)/i);
  return match?.[1]?.trim() || "";
}

function inferNeedsUserTest(issue, taskType) {
  const choice = getIssueFormUserTestChoice(issue.body || "");
  if (choice.includes("不要そう")) return "No";
  if (choice.includes("必要そう")) return "Yes";
  if (choice.includes("不明")) return "Yes";

  if (taskType === "Bug" || taskType === "Improvement") return "Yes";
  return "No";
}

function optionId(field, optionName) {
  return field?.options?.find((option) => option.name === optionName)?.id || null;
}

async function addIssue(projectId, issueId) {
  const data = await graphql(
    `mutation($project: ID!, $content: ID!) {
      addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
        item { id }
      }
    }`,
    { project: projectId, content: issueId }
  );
  return data.addProjectV2ItemById.item.id;
}

async function setSingleSelect(projectId, itemId, field, optionName) {
  if (!field) {
    console.warn(`Field missing; skipped: ${optionName}`);
    return false;
  }

  const selectedOptionId = optionId(field, optionName);
  if (!selectedOptionId) {
    console.warn(`Option missing in field ${field.name}: ${optionName}`);
    return false;
  }

  await graphql(
    `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $project,
        itemId: $item,
        fieldId: $field,
        value: { singleSelectOptionId: $option }
      }) {
        projectV2Item { id }
      }
    }`,
    {
      project: projectId,
      item: itemId,
      field: field.id,
      option: selectedOptionId
    }
  );
  return true;
}

const project = await getProject();
const trackedContentIds = await getTrackedContentIds();
const issues = await getOpenIssues();

const statusField = project.fields.get("Status");
const priorityField = project.fields.get("Priority");
const taskTypeField = project.fields.get("Task Type");
const userTestField = project.fields.get("Needs User Test");

for (const [fieldName, field] of [
  ["Status", statusField],
  ["Priority", priorityField],
  ["Task Type", taskTypeField],
  ["Needs User Test", userTestField]
]) {
  if (!field) console.warn(`Project field not found: ${fieldName}`);
}

let added = 0;
let alreadyTracked = 0;

for (const issue of issues) {
  if (trackedContentIds.has(issue.id)) {
    alreadyTracked += 1;
    continue;
  }

  const taskType = inferTaskType(issue);
  const needsUserTest = inferNeedsUserTest(issue, taskType);
  const label = `${issue.repository.nameWithOwner}#${issue.number}`;

  if (dryRun) {
    console.log(`[dry-run] add ${label}: P2 / ${taskType} / User Test ${needsUserTest}`);
    added += 1;
    continue;
  }

  const itemId = await addIssue(project.id, issue.id);
  await setSingleSelect(project.id, itemId, statusField, "Todo");
  await setSingleSelect(project.id, itemId, priorityField, "P2");
  await setSingleSelect(project.id, itemId, taskTypeField, taskType);
  await setSingleSelect(project.id, itemId, userTestField, needsUserTest);

  trackedContentIds.add(issue.id);
  added += 1;
  console.log(`Added ${label}: P2 / ${taskType} / User Test ${needsUserTest}`);
}

console.log(`Project sync complete. Open issues=${issues.length}, already tracked=${alreadyTracked}, ${dryRun ? "would add" : "added"}=${added}`);

writeSummary([
  "## EliteMay Development project sync",
  "",
  `- Project: ${project.title} (#${projectNumber})`,
  `- Open issues found: ${issues.length}`,
  `- Already tracked: ${alreadyTracked}`,
  `- ${dryRun ? "Would add" : "Added"}: ${added}`,
  `- Dry run: ${dryRun ? "yes" : "no"}`,
  "",
  "New items receive `Status=Todo`, `Priority=P2`, inferred `Task Type`, and inferred `Needs User Test`. Existing project items are not overwritten."
]);
