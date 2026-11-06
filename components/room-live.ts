"use client";
import {useEffect,useState} from "react";
import {notifyLive} from "./live-notifications";
export function useRoomLive(room:string|null,projectName?:string){
  const [state,setState]=useState("connecting");
  useEffect(()=>{if(!room)return;let stopped=false,socket:WebSocket|null=null,retry:ReturnType<typeof setTimeout>|undefined,attempt=0;setState("connecting");
    function connect(){if(stopped)return;const url=new URL("/api/v1/live",location.origin);url.protocol=location.protocol==="https:"?"wss:":"ws:";url.searchParams.set("room",room!);socket=new WebSocket(url);
      socket.onopen=()=>{attempt=0;setState("live");};socket.onmessage=event=>{try{const message=JSON.parse(event.data);if(message.room!==room)return;if(message.type==="ready"||message.type==="changed")window.dispatchEvent(new CustomEvent("relay-room-update",{detail:{room,payload:message.payload}}));const m=message.payload?.message;if(message.type==="changed"&&m?.id)notifyLive({id:room+":"+m.id,room:room!,project:projectName||room!,summary:m.summary||"项目有新动态",sender:m.sender,kind:m.kind});}catch{}};
      socket.onerror=()=>socket?.close();socket.onclose=()=>{if(stopped)return;setState("retrying");retry=setTimeout(connect,Math.min(10000,500*2**Math.min(attempt++,5)));};
    }
    const visible=()=>{if(!document.hidden&&socket?.readyState===WebSocket.CLOSED){clearTimeout(retry);connect();}};connect();document.addEventListener("visibilitychange",visible);return()=>{stopped=true;clearTimeout(retry);document.removeEventListener("visibilitychange",visible);socket?.close();};
  },[room,projectName]);return state;
}
