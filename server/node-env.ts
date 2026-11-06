import path from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteD1 } from "./sqlite-d1";
import { readFileSync } from "node:fs";
const here=path.dirname(fileURLToPath(import.meta.url));
export const nativeDb=new SqliteD1(path.join(process.env.RELAY_DATA_DIR||path.join(here,"data"),"relay.sqlite"),process.env.RELAY_MIGRATIONS_DIR||path.join(here,"drizzle"));
let releaseSha="";try{releaseSha=JSON.parse(readFileSync(path.join(here,"release-info.json"),"utf8")).commit||"";}catch{}
export const env:Cloudflare.Env={DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY,DEEPSEEK_MODEL_NAME:process.env.DEEPSEEK_MODEL_NAME,DB:nativeDb as unknown as D1Database,RELAY_READ_ONLY:process.env.RELAY_READ_ONLY||"0",RELAY_PUBLIC_URL:process.env.RELAY_PUBLIC_URL||"",RELAY_REDIRECT_URL:process.env.RELAY_REDIRECT_URL||"",RELAY_RUNTIME:"node-sqlite",RELAY_RELEASE_SHA:releaseSha,RELAY_OVERVIEW_PASSWORD_HASH:process.env.RELAY_OVERVIEW_PASSWORD_HASH,RELAY_OVERVIEW_SESSION_SECRET:process.env.RELAY_OVERVIEW_SESSION_SECRET};
