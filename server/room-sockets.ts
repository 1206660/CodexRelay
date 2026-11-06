import {WebSocketServer,WebSocket} from "ws";
import type {Server} from "node:http";
import {env} from "./node-env";
export function attachRoomSockets(server:Server){
  const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false}),rooms=new Map<string,Set<WebSocket>>(),info=new Map<WebSocket,{room:string;ip:string;alive:boolean}>();
  server.on("upgrade",(request,socket,head)=>{void(async()=>{try{
    const origin=env.RELAY_PUBLIC_URL||"http://"+request.headers.host,url=new URL(request.url||"/",origin),room=url.searchParams.get("room")||"";
    if(url.pathname!=="/api/v1/live"||url.searchParams.getAll("room").length!==1||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(room)){socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");return;}
    if(request.headers.origin&&request.headers.origin!==origin){socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");return;}
    const local=["127.0.0.1","::1","::ffff:127.0.0.1"].includes(request.socket.remoteAddress||""),ip=local&&request.headers["x-real-ip"]?String(request.headers["x-real-ip"]):request.socket.remoteAddress||"unknown";
    if(info.size>=500||Array.from(info.values()).filter(v=>v.ip===ip).length>=20){socket.end("HTTP/1.1 429 Too Many Requests\r\n\r\n");return;}
    if(!await env.DB!.prepare("SELECT id FROM rooms WHERE id=?").bind(room).first()){socket.end("HTTP/1.1 404 Not Found\r\n\r\n");return;}
    wss.handleUpgrade(request,socket,head,ws=>{const group=rooms.get(room)||new Set<WebSocket>();group.add(ws);rooms.set(room,group);info.set(ws,{room,ip,alive:true});
      ws.on("pong",()=>{const record=info.get(ws);if(record)record.alive=true;});ws.on("error",()=>{});ws.on("message",()=>ws.close(1008,"This project feed is read-only"));ws.on("close",()=>{group.delete(ws);if(!group.size)rooms.delete(room);info.delete(ws);});ws.send(JSON.stringify({type:"ready",room,at:Date.now()}));
    });
  }catch{socket.destroy();}})();});
  const timer=setInterval(()=>{for(const [ws,state]of info){if(!state.alive){ws.terminate();continue;}state.alive=false;ws.ping();}},25000);timer.unref();
  return {publish(room:string,payload:unknown){const frame=JSON.stringify({type:"changed",room,at:Date.now(),payload});for(const ws of rooms.get(room)||[]){if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<65536)ws.send(frame);}},close(){clearInterval(timer);for(const ws of info.keys())ws.terminate();wss.close();}};
}
