"use client";
import {useEffect,useRef,useState} from "react";
import {CheckCheck,LoaderCircle,Star,ThumbsUp} from "lucide-react";
import type {MemberRecord} from "../lib/control-model";
import {ControlError,controlApi,useLive} from "./control-ui";
import {useOverviewAccess} from "./overview-access";
export function MemberReputation({member}:{member:MemberRecord}){
  const s=member.orders||{completed_orders:0,positive_orders:0,rated_orders:0,positive_rate:null};
  return <div className="member-reputation"><span title="已验收完成的订单" aria-label={"已完成 "+s.completed_orders+" 单"}><CheckCheck size={12}/>{s.completed_orders}</span><span title="4–5星好评订单数" aria-label={"好评 "+s.positive_orders+" 单"}><ThumbsUp size={12}/>{s.positive_orders}</span><span title={s.rated_orders?"好评率 = 4–5星订单 / 已评订单，共 "+s.rated_orders+" 单":"尚无评价，不计算好评率"} aria-label={s.rated_orders?"好评率 "+s.positive_rate+"%":"暂无评价"}><Star size={12}/>{s.positive_rate===null?"—":s.positive_rate+"%"}</span></div>;
}
type Review={stars:number;comment:string;version:number;reviewer:string};
export function OrderRating({room,id,onChanged}:{room:string;id:number;onChanged:()=>void}){
  const access=useOverviewAccess(),live=useLive<{review:Review|null}>("/projects/"+room+"/tasks/"+id+"/review");
  const [stars,setStars]=useState(5),[comment,setComment]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false),initial=useRef(false),version=useRef(0),pending=useRef<{payload:string;id:string}|null>(null);
  function load(review:Review|null){setStars(review?.stars||5);setComment(review?.comment||"");version.current=review?.version||0;initial.current=true;}
  useEffect(()=>{if(live.data&&!initial.current)load(live.data.review);},[live.data]);
  async function save(){if(busy||!initial.current)return;setBusy(true);setError("");const payload=JSON.stringify({stars,comment:comment.trim(),expected_version:version.current});if(pending.current?.payload!==payload)pending.current={payload,id:crypto.randomUUID()};
    try{const result=await controlApi<{review:Review}>("/projects/"+room+"/tasks/"+id+"/review",{method:"POST",body:JSON.stringify({...JSON.parse(payload),client_id:pending.current.id})});version.current=result.review.version;pending.current=null;setSaved(true);live.reload();onChanged();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
  return <section className="order-rating"><header><Star size={18}/><h3>完成订单 · 主人评价</h3>{live.data?.review&&<small>已评 {live.data.review.stars} 星</small>}</header>{access.authenticated?<><div className="order-stars" role="group" aria-label="订单评分">{[1,2,3,4,5].map(n=><button type="button" key={n} aria-label={n+"星"} aria-pressed={n===stars} disabled={busy} onClick={()=>{setStars(n);setSaved(false);}}><Star size={27} fill={n<=stars?"currentColor":"none"}/></button>)}<span>{stars>=4?"好评":stars===3?"一般":"需要改进"}</span></div><textarea aria-label="订单评价" maxLength={1000} rows={2} placeholder="这次做得怎么样？写下具体反馈，帮助伙伴改进。" value={comment} onChange={e=>{setComment(e.target.value);setSaved(false);}}/>{error&&<ControlError message={error} onRetry={()=>void controlApi<{review:Review|null}>("/projects/"+room+"/tasks/"+id+"/review").then(r=>{load(r.review);setError("");})}/>}<footer><small>4–5星计好评，同一订单只计一次。</small><button className="control-primary" disabled={busy||!initial.current} onClick={()=>void save()}>{busy?<LoaderCircle size={15}/>:<ThumbsUp size={15}/>} {saved?"评价已同步":live.data?.review?"更新评价":"提交评价"}</button></footer></>:live.data?.review?<><div className="order-stars readonly">{[1,2,3,4,5].map(n=><Star key={n} size={20} fill={n<=live.data!.review!.stars?"currentColor":"none"}/>)}</div><p>{live.data.review.comment||"主人未填写文字评价"}</p></>:<p>订单已完成，等待主人评价。<a href="/" target="_blank" rel="noreferrer">解锁总览后评价 ↗</a></p>}</section>;
}
