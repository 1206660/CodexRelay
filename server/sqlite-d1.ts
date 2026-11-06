import { DatabaseSync } from "node:sqlite";
import { mkdirSync,readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
type Result={results:any[];success:true;meta:{changes:number;last_row_id:number;duration:number;changed_db:boolean;served_by:string}};
export class SqliteD1 {
  readonly sqlite:DatabaseSync;
  constructor(file:string,migrations:string){
    mkdirSync(path.dirname(file),{recursive:true});
    this.sqlite=new DatabaseSync(file);
    this.sqlite.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    this.sqlite.exec("CREATE TABLE IF NOT EXISTS _relay_migrations(tag TEXT PRIMARY KEY,hash TEXT NOT NULL,applied_at INTEGER NOT NULL)");
    const journal=JSON.parse(readFileSync(path.join(migrations,"meta","_journal.json"),"utf8"));
    for(const entry of journal.entries){
      const sql=readFileSync(path.join(migrations,entry.tag+".sql"),"utf8").replace(/\r\n/g,"\n"),hash=createHash("sha256").update(sql).digest("hex");
      const applied=this.sqlite.prepare("SELECT hash FROM _relay_migrations WHERE tag=?").get(entry.tag) as any;
      if(applied){if(applied.hash!==hash)throw new Error("已应用迁移被修改："+entry.tag);continue;}
      this.sqlite.exec("BEGIN IMMEDIATE");
      try{this.sqlite.exec(sql);this.sqlite.prepare("INSERT INTO _relay_migrations(tag,hash,applied_at) VALUES(?,?,?)").run(entry.tag,hash,Date.now());this.sqlite.exec("COMMIT");}
      catch(e){this.sqlite.exec("ROLLBACK");throw e;}
    }
  }
  prepare(sql:string){return new SqliteStatement(this,sql,[]);}
  async batch<T=any>(statements:SqliteStatement[]):Promise<any[]>{
    this.sqlite.exec("BEGIN IMMEDIATE");
    try{const results=statements.map(s=>s.execute());this.sqlite.exec("COMMIT");return results;}
    catch(e){this.sqlite.exec("ROLLBACK");throw e;}
  }
  async exec(sql:string){this.sqlite.exec(sql);return {count:1,duration:0};}
}
class SqliteStatement{
  constructor(private db:SqliteD1,private sql:string,private values:any[]){}
  bind(...values:any[]){return new SqliteStatement(this.db,this.sql,values.map(v=>v===undefined?null:v));}
  execute():Result{
    const start=performance.now(),rows=this.db.sqlite.prepare(this.sql).all(...this.values),meta=this.db.sqlite.prepare("SELECT changes() AS changes,last_insert_rowid() AS last_row_id").get() as any;
    return {results:rows,success:true,meta:{changes:meta.changes,last_row_id:Number(meta.last_row_id),duration:performance.now()-start,changed_db:!/^\s*(SELECT|WITH|PRAGMA)/i.test(this.sql),served_by:"private-server-sqlite"}};
  }
  async all<T=any>(){return this.execute();}
  async run<T=any>(){return this.execute();}
  async first<T=any>(column?:string):Promise<T|null>{const row=this.execute().results[0];return row?(column?row[column]:row):null;}
  async raw<T=any>(options?:{columnNames?:boolean}){const rows=this.execute().results;return options?.columnNames&&rows.length?[Object.keys(rows[0]),...rows.map(Object.values)]:rows.map(Object.values);}
}
