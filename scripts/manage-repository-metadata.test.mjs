import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCatalog, selectRepositories, planOne, executeCatalog, createGitHubApi, formatResult
} from "./manage-repository-metadata.mjs";
import { readFileSync } from "node:fs";

const actual = JSON.parse(readFileSync(new URL("../config/public-repository-metadata.json", import.meta.url)));
const sample = { owner: "EliteMay", scope: "public-only", repositories: [
  { name: ".github", description: "Common repository defaults", topics: ["elite-core", "github-actions"] },
  { name: "java", description: "Java tutorials", topics: ["elite-app", "java"] }
] };
const repo = (name, overrides = {}) => ({
  name, private: false, visibility: "public", archived: false,
  owner: { login: "EliteMay" }, description: "", ...overrides
});

function fakeApi({ current = {} } = {}) {
  const writes = [];
  const api = {
    getRepo: async name => current[name]?.repo || repo(name),
    getTopics: async name => current[name]?.topics || [],
    updateDescription: async (name, description) => { writes.push({ method: "PATCH", name, description }); },
    replaceTopics: async (name, topics) => { writes.push({ method: "PUT", name, topics }); }
  };
  return { api, writes };
}

test("35 public catalog entries are unique and no private projects are present", () => {
  assert.equal(validateCatalog(actual).length, 35);
  assert.ok(!actual.repositories.some(r => ["chatgpt-workspace", "web-project-data"].includes(r.name)));
  assert.ok(actual.repositories.some(r => r.name === "site-min" && r.topics.includes("oauth")));
  assert.equal(selectRepositories(actual, "all").length, 35);
  assert.deepEqual(selectRepositories(actual, "pc-agent").map(x => x.name), ["pc-agent"]);
});

test("rejects invalid, duplicate or private metadata before any request", () => {
  assert.throws(() => validateCatalog({...sample, repositories:[...sample.repositories, sample.repositories[0]]}), /Duplicate/);
  assert.throws(() => validateCatalog({...sample, repositories:[{...sample.repositories[0], name:"web-project-data"}]}), /private/);
  assert.throws(() => validateCatalog({...sample, repositories:[{...sample.repositories[0], topics:["capital letter"]}]}), /Invalid topics/);
  assert.throws(() => selectRepositories(sample, "../admin"), /Invalid/);
  assert.throws(() => selectRepositories(sample, "another-repo"), /Scope not in/);
});

test("plan mode never writes and preserves existing metadata", async () => {
  const {api,writes}=fakeApi({current:{
    "java":{repo:repo("java",{description:"Original description"}),topics:["existing-topic","java"]},
    ".github":{repo:repo(".github",{description:""}),topics:["owner-topic"]}
  }});
  const res=await executeCatalog({catalog:sample,scope:"all",api});
  assert.equal(res.mode,"PLAN ONLY");
  assert.equal(res.descriptionAdds,1);
  assert.equal(res.topicUpdates,2);
  assert.equal(writes.length,0);
  assert.ok(res.plans.find(p=>p.name==="java").topics.includes("existing-topic"));
  assert.ok(!res.plans.find(p=>p.name==="java").description);
  assert.match(formatResult(res), /public-only/);
});

test("apply requires explicit confirmation and only writes missing metadata", async () => {
  const {api,writes}=fakeApi();
  await assert.rejects(executeCatalog({catalog:sample,scope:".github",api,apply:true}),/confirmation/);
  assert.equal(writes.length,0);
  const res=await executeCatalog({catalog:sample,scope:".github",api,apply:true,confirmation:"APPLY_METADATA"});
  assert.equal(res.mode,"APPLIED");
  assert.deepEqual(writes.map(x=>x.method),["PATCH","PUT"]);
  assert.deepEqual(writes.find(x=>x.method==="PUT").topics,["elite-core","github-actions"]);
});

test("preflight fails closed on private, archived and invalid repo identity", () => {
  const r=sample.repositories[0];
  assert.throws(()=>planOne(r,repo(r.name,{private:true,visibility:"private"}),[]),/refusing/);
  assert.throws(()=>planOne(r,repo(r.name,{archived:true}),[]),/refusing/);
  assert.throws(()=>planOne(r,repo("different"),[]),/refusing/);
  assert.throws(()=>planOne(r,repo(r.name),Array.from({length:20},(_,i)=>"existing-"+i)),/Too many/);
});

test("all-scope preflight failure cannot partially write", async () => {
  const {api,writes}=fakeApi();
  api.getRepo=async name=>name==="java"?repo(name,{archived:true}):repo(name);
  await assert.rejects(executeCatalog({catalog:sample,scope:"all",api,apply:true,confirmation:"APPLY_METADATA"}),/refusing/);
  assert.equal(writes.length,0);
});

test("GitHub transport uses only the exact PATCH, PUT, GET endpoints", async () => {
  const calls=[];
  const f=async (url,options)=>{
    calls.push({url,method:options.method,body:options.body ? JSON.parse(options.body):null});
    return {ok:true,status:200,json:async()=> url.endsWith("/topics")?{names:[]}:{name:"java",private:false}};
  };
  const c=createGitHubApi("example-test-token",f);
  await c.getRepo("java");await c.getTopics("java");
  await c.updateDescription("java","something");
  await c.replaceTopics("java",["java"]);
  assert.deepEqual(calls.map(c=>c.method),["GET","GET","PATCH","PUT"]);
  assert.ok(calls.every(c=>c.url.startsWith("https://api.github.com/repos/EliteMay/java")));
  assert.deepEqual(calls[3].body,{names:["java"]});
  await assert.rejects(c.getRepo("chatgpt-workspace"),/Invalid repository/);
});
