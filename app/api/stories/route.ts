import { database,json,problem } from '../../../lib/story/http';
import { actor,sameOrigin,readJSON,listStories,getStory,createStory,updateStory,present } from '../../../lib/story/service.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const owner=actor(request),id=new URL(request.url).searchParams.get('id');return json(id?present(await getStory(database(),owner,id),new URL(request.url).origin):{items:await listStories(database(),owner)});}catch(e){return problem(e);}}
export async function POST(request:Request){try{sameOrigin(request);const owner=actor(request),input=await readJSON(request),db=database();const r=input.id?await updateStory(db,owner,input.id,input):await createStory(db,owner,input);return json(present(r,new URL(request.url).origin));}catch(e){return problem(e);}}
