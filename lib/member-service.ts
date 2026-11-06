import type { AgentRecord } from "./control-model";
export function agentStale(agent:any,now=Date.now()){
  const updated=Number(agent.updated_at||0),interval=Math.max(1,Math.min(30,Number(agent.polling_interval_minutes)||1));
  const idle=agent.mode==="scheduled"&&["waiting","listening"].includes(agent.state);
  const deadline=idle?Math.max(updated+180000,Math.min(Number(agent.next_check_at)||updated+interval*60000,updated+1800000)+90000):updated+180000;
  return now>deadline;
}
export function roleLabel(role:string) {return ({planner:"策划",ui:"UI",developer:"程序"} as Record<string,string>)[role]||role||"成员";}
export async function listMembers(db:D1Database,room?:string){
  const rows=await db.prepare(`SELECT * FROM (
    SELECT m.room_id,m.sender,m.display_name,m.role,m.responsibility,m.active,m.created_at,m.updated_at,
      a.state,a.task,a.waiting_for,a.mode,a.last_read_id,a.updated_at AS last_seen,a.polling_interval_minutes,a.next_check_at,a.automation_id
    FROM project_members m LEFT JOIN agents a ON a.room_id=m.room_id AND a.sender=m.sender
    UNION ALL
    SELECT a.room_id,a.sender,a.sender AS display_name,a.role,'' AS responsibility,1 AS active,a.updated_at AS created_at,a.updated_at,
      a.state,a.task,a.waiting_for,a.mode,a.last_read_id,a.updated_at AS last_seen,a.polling_interval_minutes,a.next_check_at,a.automation_id
    FROM agents a WHERE NOT EXISTS(SELECT 1 FROM project_members m WHERE m.room_id=a.room_id AND m.sender=a.sender)
    UNION ALL
    SELECT x.room_id,x.sender,x.sender AS display_name,'成员' AS role,'' AS responsibility,1 AS active,MIN(x.created_at) AS created_at,MAX(x.created_at) AS updated_at,
      NULL AS state,NULL AS task,NULL AS waiting_for,NULL AS mode,NULL AS last_read_id,NULL AS last_seen,NULL AS polling_interval_minutes,NULL AS next_check_at,NULL AS automation_id
    FROM messages x WHERE x.sender!=substr(x.room_id,1,60)||'-owner' AND x.sender NOT LIKE 'system-%'
      AND NOT EXISTS(SELECT 1 FROM project_members m WHERE m.room_id=x.room_id AND m.sender=x.sender)
      AND NOT EXISTS(SELECT 1 FROM agents a WHERE a.room_id=x.room_id AND a.sender=x.sender)
    GROUP BY x.room_id,x.sender
    ) ${room?"WHERE room_id=?":""} ORDER BY active DESC,created_at ASC,sender ASC`).bind(...(room?[room]:[])).all<any>();
  const totals=await db.prepare(`SELECT t.room_id,t.assignee AS sender,SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) AS completed_orders,SUM(CASE WHEN t.status IN ('claimed','in_progress','blocked') THEN 1 ELSE 0 END) AS active_orders,COUNT(r.stars) AS rated_orders,SUM(CASE WHEN r.stars>=4 THEN 1 ELSE 0 END) AS positive_orders,AVG(r.stars) AS average_stars FROM tasks t LEFT JOIN order_reviews r ON r.task_id=t.id AND r.room_id=t.room_id AND r.assignee=t.assignee WHERE t.assignee IS NOT NULL ${room?"AND t.room_id=?":""} GROUP BY t.room_id,t.assignee`).bind(...(room?[room]:[])).all<any>();
  const stats=new Map(totals.results.map(s=>[s.room_id+":"+s.sender,{...s,positive_rate:s.rated_orders?Math.round(s.positive_orders/s.rated_orders*100):null}]));
  const now=Date.now();return rows.results.map(m=>({...m,role_label:roleLabel(m.role),stale:!!m.last_seen&&agentStale({...m,updated_at:m.last_seen},now),orders:stats.get(m.room_id+":"+m.sender)||{completed_orders:0,active_orders:0,rated_orders:0,positive_orders:0,positive_rate:null,average_stars:null}}));
}
