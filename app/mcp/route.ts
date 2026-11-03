import { database } from '../../lib/story/http';
import { handleMCP } from '../../lib/story/mcp.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return handleMCP(request,database());}
