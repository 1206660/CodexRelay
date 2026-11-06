import assert from 'node:assert/strict';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import path from 'node:path';
const out=path.resolve('.work/test-member-staleness.mjs');await build({entryPoints:['lib/member-service.ts'],bundle:true,platform:'node',format:'esm',outfile:out});const {agentStale}=await import(pathToFileURL(out));
const now=2000000000000,waiting={mode:'scheduled',state:'waiting',updated_at:now-600000,polling_interval_minutes:30,next_check_at:now+1200000};
assert.equal(agentStale(waiting,now),false);assert.equal(agentStale({...waiting,state:'working'},now),true);assert.equal(agentStale({...waiting,mode:'manual'},now),true);
assert.equal(agentStale({...waiting,next_check_at:now-100000},now),true);assert.equal(agentStale({...waiting,next_check_at:now+1e10},waiting.updated_at+1890001),true);
console.log('PASS: scheduled idle honors next check; working/manual still expire after 3 minutes; missed check expires; forged long deadline cannot hide stale agents.');
