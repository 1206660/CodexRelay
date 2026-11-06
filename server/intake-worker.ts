import {env} from "./node-env";
import {analyzeIntake} from "../lib/intake-model";
import {TaskError} from "../lib/task-service";
export async function startIntakeWorker(){
  const db=env.DB!;let stopped=false,busy=false;
  await db.batch([
    db.prepare("UPDATE intake_jobs SET status='failed',error='服务重启中断了本轮分析，需求已保存，请重试',updated_at=? WHERE status='running'").bind(Date.now()),
    db.prepare("UPDATE intake_sessions SET status='failed',error='服务重启中断了本轮分析，需求已保存，请重试',version=version+1,updated_at=? WHERE status='thinking' AND EXISTS(SELECT 1 FROM intake_jobs WHERE id=current_job_id AND status='failed')").bind(Date.now()),
  ]);
  async function tick(){if(stopped||busy||env.RELAY_READ_ONLY==="1"||!env.DEEPSEEK_API_KEY)return;busy=true;
    try{const job=await db.prepare("UPDATE intake_jobs SET status='running',updated_at=? WHERE id=(SELECT id FROM intake_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1) AND status='queued' RETURNING *").bind(Date.now()).first<any>();if(!job)return;
      try{
        const project=await db.prepare("SELECT COALESCE(status,'active') AS status FROM project_settings WHERE room_id=?").bind(job.room_id).first<any>();if(project&&project.status!=="active")throw new TaskError(409,"项目已暂停或归档，本轮未继续分析");
        const result=await analyzeIntake(db,job.room_id,job.session_id),now=Date.now();
        await db.batch([
          db.prepare("UPDATE intake_jobs SET status='complete',result_json=?,error='',updated_at=? WHERE id=? AND status='running'").bind(JSON.stringify(result),now,job.id),
          db.prepare("INSERT INTO intake_turns(session_id,room_id,role,content,created_at) SELECT ?,?,'assistant',?,? WHERE EXISTS(SELECT 1 FROM intake_sessions WHERE id=? AND current_job_id=? AND status='thinking')").bind(job.session_id,job.room_id,result.proposal.reply,now,job.session_id,job.id),
          db.prepare("UPDATE intake_sessions SET status='ready',proposal_json=?,error='',version=version+1,updated_at=? WHERE id=? AND room_id=? AND current_job_id=? AND status='thinking'").bind(JSON.stringify(result.proposal),now,job.session_id,job.room_id,job.id),
        ]);
      }catch(e){const message=e instanceof TaskError?e.message:"AI分析暂时失败，需求已保存，请稍后重试";await db.batch([
        db.prepare("UPDATE intake_jobs SET status='failed',error=?,updated_at=? WHERE id=?").bind(message,Date.now(),job.id),
        db.prepare("UPDATE intake_sessions SET status='failed',error=?,version=version+1,updated_at=? WHERE id=? AND room_id=? AND current_job_id=?").bind(message,Date.now(),job.session_id,job.room_id,job.id),
      ]);}
    }catch{console.error("Intake queue temporarily unavailable");}finally{busy=false;}
  }
  const timer=setInterval(()=>void tick(),1000);timer.unref();void tick();return()=>{stopped=true;clearInterval(timer);};
}
