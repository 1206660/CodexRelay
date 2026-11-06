#!/usr/bin/env python3
import hashlib,pathlib,re,subprocess,sys
version,archive,checksum=sys.argv[1:4]
if not re.fullmatch(r"v24\.\d+\.\d+",version) or not re.fullmatch(r"[a-f0-9]{64}",checksum):raise SystemExit("Invalid runtime metadata")
source=pathlib.Path(archive)
if hashlib.sha256(source.read_bytes()).hexdigest()!=checksum:raise SystemExit("Runtime checksum mismatch")
base=pathlib.Path("/opt/codex-relay")
if base.exists() and not (base/".managed").is_file():raise SystemExit("Unrecognized target directory")
base.mkdir(mode=0o755,exist_ok=True);(base/".managed").touch()
runtime=base/"runtime";runtime.mkdir(mode=0o755,exist_ok=True)
target=runtime/("node-"+version+"-linux-x64")
if not (target/"bin/node").exists():subprocess.run(["tar","--no-same-owner","-xJf",str(source),"-C",str(runtime)],check=True)
subprocess.run(["chown","-R","root:root",str(target)],check=True)
actual=subprocess.check_output([str(target/"bin/node"),"--version"],text=True).strip()
if actual!=version:raise SystemExit("Installed runtime version mismatch")
link=runtime/"current"
if link.exists() and not link.is_symlink():raise SystemExit("Runtime current is not a link")
if link.is_symlink():link.unlink()
link.symlink_to(target,target_is_directory=True)
print("Runtime installed and verified: "+actual)
