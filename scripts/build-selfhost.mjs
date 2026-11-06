import {build as viteBuild} from "vite";
import {build as esbuild} from "esbuild";
import react from "@vitejs/plugin-react";
import {mkdir,cp,readFile,writeFile,readdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import path from "node:path";
const root=process.cwd(),out=path.join(root,".work","selfhost-dist");
const args=process.argv.slice(2),index=args.indexOf("--public-url"),origin=index>=0?args[index+1]:process.env.RELAY_PUBLIC_URL||"http://127.0.0.1:8790";
const parsed=new URL(origin);if(!["https:","http:"].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=="/"||parsed.search||parsed.hash)throw new Error("Use a bare public origin without credentials or path");
const canonical=parsed.origin;
const define={"import.meta.env.VITE_RELAY_PUBLIC_URL":JSON.stringify(canonical)};
await mkdir(out,{recursive:true});
await viteBuild({configFile:false,root:path.join(root,"selfhost"),publicDir:path.join(root,"public"),plugins:[react()],define,css:{postcss:root},build:{outDir:path.join(out,"public"),emptyOutDir:true,target:"es2022"}});
for(const [entry,name] of [["server/index.ts","server.mjs"],["server/import-data.ts","import-data.mjs"]]){
  await esbuild({entryPoints:[path.join(root,entry)],bundle:true,platform:"node",format:"esm",target:"node22",outfile:path.join(out,name),alias:{"cloudflare:workers":path.join(root,"server","node-env.ts")},define,external:["node:sqlite"],banner:{js:'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);'}});
}
await cp(path.join(root,"drizzle"),path.join(out,"drizzle"),{recursive:true});
await mkdir(path.join(out,"deploy"),{recursive:true});
for(const name of await readdir(path.join(root,"deploy")))await writeFile(path.join(out,"deploy",name),(await readFile(path.join(root,"deploy",name),"utf8")).replace(/\r\n/g,"\n"));
let commit="",dirty=true;try{commit=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();dirty=!!execFileSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8"}).trim();}catch{}
await writeFile(path.join(out,"release-info.json"),JSON.stringify({commit,dirty,public_url:canonical,built_at:new Date().toISOString()})+"\n");
console.log(JSON.stringify({directory:out,public_url:canonical}));
