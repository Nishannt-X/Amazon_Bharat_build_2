import test from "node:test";
import assert from "node:assert/strict";
import {localFirstCv} from "./cv-selection";

test("local success never starts cloud processing",async()=>{
  let cloudCalls=0;
  const result=await localFirstCv(async()=>"measurements",async()=>{cloudCalls++;return "cloud";});
  assert.deepEqual(result,{value:"measurements",engine:"local"});assert.equal(cloudCalls,0);
});
test("missing or failing local runtime falls back exactly once",async()=>{
  const calls:string[]=[];
  const result=await localFirstCv(async()=>{calls.push("local");throw new Error("ENOENT");},async()=>{calls.push("cloud");return "measurements";});
  assert.deepEqual(calls,["local","cloud"]);assert.equal(result.engine,"fargate");
});
test("cloud-only host never invokes local Python",async()=>{
  const result=await localFirstCv(async()=>{throw new Error("Must not execute");},async()=>"measurements",false);
  assert.equal(result.value,"measurements");assert.equal(result.engine,"fargate");
});
test("both failures propagate rather than fabricate a successful CV result",async()=>{
  await assert.rejects(localFirstCv(async()=>{throw new Error("missing");},async()=>{throw new Error("Cloud unavailable");}),/Cloud unavailable/);
});
