import Relay from "./relay";
import ProjectOverview from "../components/project-overview";
export const dynamic="force-dynamic";
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  return typeof params?.room==="string"?<Relay/>:<ProjectOverview/>;
}
