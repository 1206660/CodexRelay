import type { AgentRecord } from "./control-model";
export function roleLabel(role:string) {return ({planner:"策划",ui:"UI",developer:"程序"} as Record<string,string>)[role]||role||"成员";}
export async function listMembers(db:D1Database,room?:string){
  const rows=await db.prepare(`SELECT * FROM (
    SELECT m.room_id,m.sender,m.display_name,m.role,m.responsibility,m.active,m.created_at,m.updated_at,
      a.state,a.task,a.waiting_for,a.mode,a.last_read_id,a.updated_at AS last_seen
    FROM project_members m LEFT JOIN agents a ON a.room_id=m.room_id AND a.sender=m.sender
    UNION ALL
    SELECT a.room_id,a.sender,a.sender AS display_name,a.role,'' AS responsibility,1 AS active,a.updated_at AS created_at,a.updated_at,
      a.state,a.task,a.waiting_for,a.mode,a.last_read_id,a.updated_at AS last_seen
    FROM agents a WHERE NOT EXISTS(SELECT 1 FROM project_members m WHERE m.room_id=a.room_id AND m.sender=a.sender)
    UNION ALL
    SELECT x.room_id,x.sender,x.sender AS display_name,'成员' AS role,'' AS responsibility,1 AS active,MIN(x.created_at) AS created_at,MAX(x.created_at) AS updated_at,
      NULL AS state,NULL AS task,NULL AS waiting_for,NULL AS mode,NULL AS last_read_id,NULL AS last_seen
    FROM messages x WHERE x.sender!=substr(x.room_id,1,60)||'-owner' AND x.sender NOT LIKE 'system-%'
      AND NOT EXISTS(SELECT 1 FROM project_members m WHERE m.room_id=x.room_id AND m.sender=x.sender)
      AND NOT EXISTS(SELECT 1 FROM agents a WHERE a.room_id=x.room_id AND a.sender=x.sender)
    GROUP BY x.room_id,x.sender
    ) ${room?"WHERE room_id=?":""} ORDER BY active DESC,created_at ASC,sender ASC`).bind(...(room?[room]:[])).all<any>();
  const now=Date.now();return rows.results.map(m=>({...m,role_label:roleLabel(m.role),stale:!!m.last_seen&&now-m.last_seen>180000}));
}
