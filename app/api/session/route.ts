import { json } from '../../../lib/story/http';
export const dynamic='force-dynamic';
export function GET(request:Request){return json({signed_in:Boolean(request.headers.get('oai-authenticated-user-id')),display_name:request.headers.get('oai-authenticated-user-email')||null,sign_in_url:'/signin-with-chatgpt?return_to=%2F',integration:{sonjapgo:'eligibility_unverified',filmcraft:'not_connected'}});}
