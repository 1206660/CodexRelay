import { env } from "cloudflare:workers";
const encoder=new TextEncoder(),cookieName="relay_overview",lifetime=7*24*60*60;
function hex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,"0")).join("");}
function unhex(value:string){return new Uint8Array(value.match(/../g)!.map(n=>parseInt(n,16)));}
function equal(a:string,b:string){let result=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)result|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return result===0;}
export function overviewConfigured(){return !!env.RELAY_OVERVIEW_PASSWORD_HASH&&!!env.RELAY_OVERVIEW_SESSION_SECRET;}
async function signature(value:string){
  const key=await crypto.subtle.importKey("raw",encoder.encode(env.RELAY_OVERVIEW_SESSION_SECRET!),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(await crypto.subtle.sign("HMAC",key,encoder.encode(value)));
}
export async function overviewAuthorized(request:Request){
  if(!overviewConfigured())return false;
  const token=request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(cookieName+"="))?.slice(cookieName.length+1)||"";
  const match=token.match(/^(\d{13})\.([a-f0-9]{64})$/);if(!match)return false;
  const expires=Number(match[1]);if(expires<=Date.now()||expires>Date.now()+lifetime*1000+60000)return false;
  return equal(await signature(match[1]),match[2]);
}
export async function verifyOverviewPassword(password:unknown){
  if(typeof password!=="string"||password.length>256||!overviewConfigured())return false;
  const parts=env.RELAY_OVERVIEW_PASSWORD_HASH!.split("$");
  if(parts.length!==4||parts[0]!=="pbkdf2-sha256"||parts[1]!=="100000"||!/^[a-f0-9]{32}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))return false;
  const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  const result=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:unhex(parts[2]),iterations:100000},key,256);
  return equal(hex(result),parts[3]);
}
export async function overviewCookie(request:Request,clear=false){
  const expires=String(Date.now()+lifetime*1000),value=clear?"":expires+"."+await signature(expires);
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:lifetime}${new URL(request.url).protocol==="https:"?"; Secure":""}`;
}
