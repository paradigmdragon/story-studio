import { env } from 'cloudflare:workers';
export function database(){if(!env.DB)throw new Error('DB binding unavailable');return env.DB;}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
export function problem(e:any){return json({error:e.code||'server_error',message:e.status?e.message:'저장하지 못했습니다. 잠시 뒤 상태를 다시 확인해주세요.'},e.status||500);}
