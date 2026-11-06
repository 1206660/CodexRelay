import { readFileSync } from "node:fs";
import { nativeDb,env } from "./node-env";
import { importTasks } from "../lib/task-service";
const file=process.argv[2];if(!file)throw new Error("Usage: node import-data.mjs snapshot.json [--merge]");
const snapshot=JSON.parse(readFileSync(file,"utf8"));
if(snapshot.version!==1||!snapshot.data||!Array.isArray(snapshot.data.rooms))throw new Error("Unrecognized snapshot");
const db=nativeDb.sqlite;
const existing=db.prepare("SELECT COUNT(*) AS count FROM messages").get() as any;
if(existing.count&&!process.argv.includes("--merge"))throw new Error("Database is not empty; explicit --merge required");
const counts:Record<string,number>={};
db.exec("BEGIN IMMEDIATE");
try{
  for(const table of ["rooms","project_settings","messages","project_members","agents","tasks","task_events"]){
    const schema=db.prepare('PRAGMA table_info("'+table+'")').all() as any[],allowed=new Set(schema.map(c=>c.name)),primary=schema.filter(c=>c.pk).map(c=>c.name);
    const rows=snapshot.data[table]||[];
    for(const source of rows){
      const row={...source};if((table==="project_members"||table==="agents")&&!row.key)row.key=row.room_id+":"+row.sender;
      const columns=Object.keys(row).filter(c=>allowed.has(c));if(!columns.length)continue;
      const update=columns.filter(c=>!primary.includes(c)).map(c=>'"'+c+'"=excluded."'+c+'"').join(",");
      const sql='INSERT INTO "'+table+'"('+columns.map(c=>'"'+c+'"').join(",")+") VALUES("+columns.map(()=>"?").join(",")+") ON CONFLICT("+primary.map(c=>'"'+c+'"').join(",")+") "+(update?"DO UPDATE SET "+update:"DO NOTHING");
      db.prepare(sql).run(...columns.map(c=>typeof row[c]==="boolean"?(row[c]?1:0):row[c]??null));
    }
    counts[table]=(db.prepare('SELECT COUNT(*) AS count FROM "'+table+'"').get() as any).count;
  }
  db.exec("COMMIT");
}catch(e){db.exec("ROLLBACK");throw e;}
let projected=0;
for(const room of snapshot.data.rooms){for(;;){const result=await importTasks(env.DB!,room.id);projected+=result.imported;if(!result.has_more)break;}}
for(const room of snapshot.data.rooms){
  const expected=(snapshot.data.messages||[]).filter((m:any)=>m.room_id===room.id).length;
  const actual=(db.prepare("SELECT COUNT(*) AS count FROM messages WHERE room_id=?").get(room.id) as any).count;
  if(actual!==expected&&!process.argv.includes("--merge"))throw new Error("Message count mismatch for "+room.id);
}
console.log(JSON.stringify({imported:true,source:snapshot.source_url,counts,legacy_tasks_projected:projected}));
db.close();
