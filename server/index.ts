import { createServer } from "node:http";
import { Readable } from "node:stream";
import { readFile,stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { GET,POST,PATCH } from "../app/api/v1/[[...path]]/route";
import { DEFAULT_ROOM,guideText,validRoom,validRole,validSender } from "../lib/agent-guide";
import { listMembers } from "../lib/member-service";
import JoinView from "../components/join-view";
import { env,nativeDb } from "./node-env";
import { overviewAuthorized } from "../lib/overview-auth";
import {startIntakeWorker} from "./intake-worker";
import {attachRoomSockets} from "./room-sockets";
const here=path.dirname(fileURLToPath(import.meta.url)),publicDir=path.join(here,"public");
const types:Record<string,string>={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".ico":"image/x-icon",".json":"application/json; charset=utf-8",".woff2":"font/woff2"};
const template=await readFile(path.join(publicDir,"index.html"),"utf8");
const stopIntake=await startIntakeWorker();
const server=createServer(async(req,res)=>{
  try{
    const publicOrigin=process.env.RELAY_PUBLIC_URL||"http://"+req.headers.host;
    const url=new URL(req.url||"/",publicOrigin);
    if(url.pathname.startsWith("/api/v1")){
      const origin=req.headers.origin;
      if(origin&&(origin==="https://codex-task-relay.ideal-hero-2137.chatgpt.site"||origin===publicOrigin)){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Methods","GET,POST,PATCH,HEAD,OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type");}
      if(req.method==="OPTIONS"){res.writeHead(204);res.end();return;}
      const effectiveMethod=req.method==="HEAD"?"GET":req.method;
      const headers=new Headers();for(const [name,value] of Object.entries(req.headers)){if(value)headers.set(name,Array.isArray(value)?value.join(","):value);}
      const local=["127.0.0.1","::1","::ffff:127.0.0.1"].includes(req.socket.remoteAddress||"");
      headers.set("cf-connecting-ip",local&&req.headers["x-real-ip"]?String(req.headers["x-real-ip"]):req.socket.remoteAddress||"unknown");
      const request=new Request(url,{method:effectiveMethod,headers,...(effectiveMethod!=="GET"?{body:Readable.toWeb(req) as any,duplex:"half"}:{})} as RequestInit);
      const handler=effectiveMethod==="GET"?GET:effectiveMethod==="POST"?POST:effectiveMethod==="PATCH"?PATCH:null;
      const response=handler?await handler(request):Response.json({error:{message:"请求方法不支持"}},{status:405});
      if(response.ok&&effectiveMethod!=="GET"){
        const match=url.pathname.match(/^\/api\/v1\/(?:projects|rooms)\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})(?:\/|$)/);
        if(match&&(!url.pathname.includes("/intakes")||url.pathname.endsWith("/dispatch"))){let message:any=null;try{const data:any=await response.clone().json();if(data.message)message={id:data.message.id,sender:data.message.sender,summary:data.message.summary,kind:data.message.kind};}catch{}roomSockets.publish(match[1],{message});}
      }
      res.writeHead(response.status,Object.fromEntries(response.headers.entries()));res.end(req.method==="HEAD"?undefined:Buffer.from(await response.arrayBuffer()));return;
    }
    if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405);res.end();return;}
    if(url.pathname==="/join.txt"||url.pathname==="/join"){
      const room=url.searchParams.get("room")??DEFAULT_ROOM,role=url.searchParams.get("role")??undefined,sender=url.searchParams.get("sender")??undefined;
      if(!validRoom(room)||(role!==undefined&&!validRole(role))||(sender!==undefined&&!validSender(sender))||url.searchParams.getAll("room").length>1||url.searchParams.getAll("role").length>1||url.searchParams.getAll("sender").length>1){res.writeHead(400,{"Content-Type":"text/plain; charset=utf-8"});res.end("无效项目、角色或发言名");return;}
      const members=await listMembers(env.DB!,room);
      if(url.pathname==="/join.txt"){res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"});res.end(guideText(room,role,sender,members));return;}
      const props={room,role,sender,members},snapshot=JSON.stringify(props).replace(/</g,"\\u003c");
      const html=template.replace('<div id="root"></div>','<div id="root">'+renderToString(createElement(JoinView,props))+'</div><script id="relay-guide-state" type="application/json">'+snapshot+"</script>");
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(html);return;
    }
    const pathname=decodeURIComponent(url.pathname),candidate=path.resolve(publicDir,"."+pathname);
    if(!candidate.startsWith(publicDir+path.sep)&&candidate!==publicDir){res.writeHead(403);res.end();return;}
    if((candidate===path.join(publicDir,"evidence")||candidate.startsWith(path.join(publicDir,"evidence")+path.sep))&&!await overviewAuthorized(new Request(url,{headers:{cookie:String(req.headers.cookie||"")}}))){res.writeHead(401,{"Cache-Control":"no-store"});res.end("请先解锁总览");return;}
    let file=candidate;
    try{if(!(await stat(file)).isFile())file=path.join(publicDir,"index.html");}catch{if(pathname.startsWith("/assets/")){res.writeHead(404);res.end();return;}file=path.join(publicDir,"index.html");}
    const bytes=await readFile(file),contentType=types[path.extname(file)]||"application/octet-stream";
    res.writeHead(200,{"Content-Type":contentType,"Cache-Control":pathname.startsWith("/assets/")?"public,max-age=31536000,immutable":"no-store","X-Content-Type-Options":"nosniff"});res.end(req.method==="HEAD"?undefined:bytes);
  }catch(e){console.error("Request failed",e instanceof Error?e.message:"unknown");if(!res.headersSent)res.writeHead(500,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify({error:{message:"服务暂时不可用"}}));}
});
server.requestTimeout=30000;server.headersTimeout=35000;
const roomSockets=attachRoomSockets(server);
server.listen(Number(process.env.PORT||8790),process.env.HOST||"127.0.0.1",()=>console.log("Codex Relay listening on "+(process.env.HOST||"127.0.0.1")+":"+(process.env.PORT||8790)));
function shutdown(){stopIntake();roomSockets.close();server.close(()=>{nativeDb.sqlite.close();process.exit(0);});}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
