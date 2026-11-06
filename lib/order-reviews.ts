import {env} from "cloudflare:workers";
import {overviewAuthorized} from "./overview-auth";
import {TaskError,ownerName,findTask} from "./task-service";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function handleOrderReview(request:Request,room:string,id:number){
  const db=env.DB!,task=await findTask(db,room,id);if(!task)throw new TaskError(404,"订单不存在");
  if(request.method==="GET")return json({review:await db.prepare("SELECT * FROM order_reviews WHERE room_id=? AND task_id=?").bind(room,id).first()});
  if(request.method!=="POST")throw new TaskError(405,"不支持的请求");
  if(!await overviewAuthorized(request))return json({error:{message:"只有解锁总览的主人可以评价已完成订单"}},401);
  if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)throw new TaskError(403,"请从当前站点评价");
  if(task.status!=="done"||!task.assignee)throw new TaskError(409,"订单验收完成后，才可评价实际负责人");
  if(!request.headers.get("content-type")?.includes("application/json"))throw new TaskError(415,"请使用JSON正文");
  const raw=await request.text();if(raw.length>6000)throw new TaskError(413,"评价内容过长");let d:any;try{d=JSON.parse(raw);}catch{throw new TaskError(400,"无效JSON");}
  if(!d||typeof d!=="object"||!Number.isInteger(d.stars)||d.stars<1||d.stars>5||typeof d.comment!=="string"||d.comment.length>1000||typeof d.client_id!=="string"||!d.client_id.trim()||d.client_id.length>128||!Number.isSafeInteger(d.expected_version)||d.expected_version<0)throw new TaskError(400,"请选择1–5星，并提供有效评价版本");
  const previous=await db.prepare("SELECT * FROM order_reviews WHERE room_id=? AND task_id=?").bind(room,id).first<any>();
  if(previous?.client_id===d.client_id){if(previous.stars!==d.stars||previous.comment!==d.comment.trim())throw new TaskError(409,"评价请求ID已用于其他内容");return json({review:previous,deduplicated:true});}
  if((previous?.version||0)!==d.expected_version)throw new TaskError(409,"评价已更新，请重新查看后修改");
  const actor=ownerName(room),now=Date.now(),summary="#"+id+" · "+task.assignee+" 获得 "+d.stars+" 星评价",content="## 主人评价\n- 订单：#"+id+" "+task.title+"\n- 负责人："+task.assignee+"\n- 评分："+d.stars+" / 5\n\n"+(d.comment.trim()||"未填写文字评价")+"\n\n好评按4–5星统计；同一订单仅计一次，以最新评价为准。",client="rating-"+id+"-"+d.client_id;
  await db.batch([
    db.prepare("INSERT INTO order_reviews(task_id,room_id,reviewer,assignee,stars,comment,client_id,version,created_at,updated_at) SELECT ?,?,?,?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM tasks WHERE id=? AND room_id=? AND status='done' AND assignee=?) ON CONFLICT(task_id) DO UPDATE SET stars=excluded.stars,comment=excluded.comment,client_id=excluded.client_id,version=order_reviews.version+1,updated_at=excluded.updated_at WHERE order_reviews.version=?").bind(id,room,actor,task.assignee,d.stars,d.comment.trim(),d.client_id,now,now,id,room,task.assignee,d.expected_version),
    db.prepare("INSERT INTO messages(room_id,sender,content,summary,kind,recipient,reply_to,client_id,created_at) SELECT ?,?,?,?,'decision',?,?,?,? WHERE EXISTS(SELECT 1 FROM order_reviews WHERE room_id=? AND task_id=? AND client_id=?) ON CONFLICT(room_id,sender,client_id) DO NOTHING").bind(room,actor,content,summary,task.assignee,id,client,now,room,id,d.client_id),
    db.prepare("INSERT INTO task_events(room_id,task_id,message_id,actor,action,from_state,to_state,note,created_at) SELECT room_id,?,id,sender,'rated','done','done',content,created_at FROM messages WHERE room_id=? AND sender=? AND client_id=? ON CONFLICT(message_id) DO NOTHING").bind(id,room,actor,client),
  ]);
  const review=await db.prepare("SELECT * FROM order_reviews WHERE room_id=? AND task_id=?").bind(room,id).first<any>();if(review?.client_id!==d.client_id)throw new TaskError(409,"订单或评价已变化，请重新查看");
  const message=await db.prepare("SELECT id,sender,summary,kind FROM messages WHERE room_id=? AND sender=? AND client_id=?").bind(room,actor,client).first();return json({review,message});
}
