import { normalize, copy } from '../../public/story-model.mjs';

export class StoryError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
const fail=(status,code,message)=>{throw new StoryError(status,code,message)};
export function actor(request) {
  const id=request.headers.get('oai-authenticated-user-id');
  if(!id) fail(401,'sign_in_required','계정 작품을 사용하려면 ChatGPT로 로그인해주세요.');
  return id;
}
export function sameOrigin(request) {
  if(request.headers.get('origin')!==new URL(request.url).origin) fail(403,'origin_denied','이 사이트에서 시작한 요청만 허용됩니다.');
}
export async function readJSON(request) {
  if(!request.headers.get('content-type')?.includes('application/json')) fail(415,'json_required','JSON 요청이 필요합니다.');
  // Bound the stream as well as Content-Length (which is not always supplied).
  const reader=request.body?.getReader(); if(!reader) fail(400,'invalid_json','입력 내용을 확인해주세요.');
  let size=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1_600_000){await reader.cancel();fail(413,'too_large','계정 작품은 1.5MB 이하로 저장해주세요. 큰 그림은 작품 파일에 보관해주세요.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes))}catch{fail(400,'invalid_json','입력 내용을 확인해주세요.');}
}
export function validateStory(raw) {
  if(raw?.panels?.some(p=>p.duration!==undefined&&(typeof p.duration!=='number'||p.duration<=0||p.duration>60)))fail(422,'invalid_duration','컷 길이는 0초 초과 60초 이하여야 합니다.');
  if(raw?.plan?.shots?.some(s=>typeof s.duration!=='number'||s.duration<=0||s.duration>60))fail(422,'invalid_duration','숏 길이는 0초 초과 60초 이하여야 합니다.');
  let doc;try{doc=normalize(raw)}catch(e){fail(422,'invalid_story',e.message)}
  if(!doc.title.trim())fail(422,'invalid_story','작품 제목이 필요합니다.');
  if(new Set(doc.panels.map(p=>String(p.id))).size!==doc.panels.length)fail(422,'invalid_story','컷 식별자는 서로 달라야 합니다.');
  if(new TextEncoder().encode(JSON.stringify(doc)).length>1_500_000)fail(413,'too_large','계정 작품은 1.5MB 이하로 저장해주세요. 큰 그림은 작품 파일에 보관해주세요.');
  return doc;
}
const token=s=>{if(typeof s!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(s))fail(422,'invalid_request_id','8~100자의 고유 요청 번호가 필요합니다.');return s};
const version=v=>{if(!Number.isSafeInteger(v)||v<1)fail(422,'version_required','작품을 먼저 읽고 현재 저장 버전을 보내주세요.');return v};
async function hash(data){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data))))).map(x=>x.toString(16).padStart(2,'0')).join('')}
function result(row){return {id:row.id,version:row.version,updated_at:row.updated_at,story:JSON.parse(row.document_json)}}
export async function listStories(db,owner) {
  const r=await db.prepare('SELECT id,title,version,updated_at FROM stories WHERE owner_id=? ORDER BY updated_at DESC LIMIT 50').bind(owner).all();
  return r.results;
}
export async function getStory(db,owner,id) {
  const row=await db.prepare('SELECT * FROM stories WHERE id=? AND owner_id=?').bind(id,owner).first();
  if(!row)fail(404,'not_found','작품을 찾을 수 없습니다.');return result(row);
}
export async function createStory(db,owner,input) {
  const key=token(input.request_id),id='story_'+key,doc=validateStory({...input.story,id});
  const digest=await hash(doc),now=new Date().toISOString();
  await db.prepare('INSERT OR IGNORE INTO stories (id,owner_id,title,document_json,version,updated_at,last_request_id,last_request_hash) SELECT ?,?,?,?,1,?,?,? WHERE (SELECT COUNT(*) FROM stories WHERE owner_id=?)<50').bind(id,owner,doc.title,JSON.stringify(doc),now,key,digest,owner).run();
  const row=await db.prepare('SELECT * FROM stories WHERE id=? AND owner_id=?').bind(id,owner).first();
  if(!row)fail(409,'request_conflict','계정 작품은 최대 50개입니다. 한도 또는 요청 번호 중복을 확인해주세요.');
  // Retrying an uncertain create must never create another work or return unrelated data.
  if(row.last_request_id!==key||row.last_request_hash!==digest)fail(409,'request_conflict','이 요청 번호는 이미 다른 내용에 사용됐습니다.');
  return result(row);
}
function ensureRevisions(before,after) {
  const source=['title','premise','characters','world','source_text','episode'];
  const changed=source.some(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));
  const comic=JSON.stringify(before.panels)!==JSON.stringify(after.panels);
  // Server owns minimum revision progression even when a client forgets to increment.
  after.story_revision=Math.max(before.story_revision+(changed?1:0),after.story_revision);
  after.revision=Math.max(before.revision+(comic?1:0),after.revision);
  if(after.plan&&JSON.stringify(after.plan)!==JSON.stringify(before.plan)) {
    if(after.plan.story_revision!==after.story_revision||after.plan.comic_revision!==after.revision)
      fail(422,'plan_revision_mismatch','새 영상 계획은 현재 이야기와 만화 판을 기준으로 만들어주세요.');
  }
  return after;
}
export async function updateStory(db,owner,id,input) {
  const key=token(input.request_id),expected=version(input.expected_version);
  const current=await getStory(db,owner,id);
  let doc=validateStory({...input.story,id});
  const digest=await hash({expected,doc});
  const previous=await db.prepare('SELECT last_request_id,last_request_hash FROM stories WHERE id=? AND owner_id=?').bind(id,owner).first();
  if(previous.last_request_id===key){if(previous.last_request_hash===digest)return current;fail(409,'request_conflict','같은 요청 번호의 내용이 달라졌습니다.');}
  if(current.version!==expected)fail(409,'version_conflict','다른 곳에서 수정됐습니다. 최신 작품을 읽은 뒤 변경 내용을 다시 적용해주세요.');
  doc=ensureRevisions(current.story,doc);
  const now=new Date().toISOString();
  const r=await db.prepare('UPDATE stories SET title=?,document_json=?,version=version+1,updated_at=?,last_request_id=?,last_request_hash=? WHERE id=? AND owner_id=? AND version=?').bind(doc.title,JSON.stringify(doc),now,key,digest,id,owner,expected).run();
  if(r.meta.changes!==1)fail(409,'version_conflict','저장 중 다른 수정이 반영됐습니다. 최신 작품을 다시 읽어주세요.');
  return {id,version:expected+1,updated_at:now,story:doc};
}
export function applyEdit(story,operation,input) {
  const doc=copy(story);
  if(operation==='source') {
    const allowed=['title','premise','characters','world','source_text'];
    if(!input.patch||!Object.keys(input.patch).length||Object.keys(input.patch).some(k=>!allowed.includes(k)))fail(422,'invalid_patch','수정할 이야기 원본 필드를 지정해주세요.');
    Object.assign(doc,input.patch); // Does not change panels or the saved plan.
  } else if(operation==='panel') {
    const p=doc.panels.find(p=>String(p.id)===input.panel_id);if(!p)fail(404,'panel_not_found','컷을 찾을 수 없습니다.');
    const allowed=['title','dialogue','narration','intent','motion','duration','image'];
    if(!input.patch||!Object.keys(input.patch).length||Object.keys(input.patch).some(k=>!allowed.includes(k)))fail(422,'invalid_patch','수정할 컷 필드를 지정해주세요.');
    if('image' in input.patch&&input.patch.image&&!/^(comic|panel-[123])\.jpg$|^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.patch.image))fail(422,'invalid_image','이미지는 기존 예시 또는 내장된 이미지 데이터여야 합니다.');
    Object.assign(p,input.patch);
  } else if(operation==='plan') {
    const shots=input.shots;if(!Array.isArray(shots)||!shots.length||shots.length>200)fail(422,'invalid_plan','1~200개의 숏이 필요합니다.');
    const ids=new Set(doc.panels.map(p=>String(p.id)));
    if(shots.some(s=>!ids.has(String(s.source_panel))))fail(422,'invalid_plan','각 숏은 실제 컷에 연결되어야 합니다.');
    doc.plan={id:crypto.randomUUID(),created_at:new Date().toISOString(),story_revision:doc.story_revision,comic_revision:doc.revision,shots};
  } else fail(422,'invalid_operation','지원하지 않는 변경입니다.');
  return doc;
}
export function present(record,origin) {
  return {...record,workspace_url:origin+'/?story='+encodeURIComponent(record.id)+'#workspace',
    plan_stale:Boolean(record.story.plan&&(record.story.plan.story_revision!==record.story.story_revision||record.story.plan.comic_revision!==record.story.revision)),
    assets:record.story.panels.map(p=>({panel_id:String(p.id),url:p.image?.startsWith('data:')?null:p.image?origin+'/'+p.image:null,embedded:Boolean(p.image?.startsWith('data:'))}))};
}
