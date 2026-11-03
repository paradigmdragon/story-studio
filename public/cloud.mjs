// Shared account storage. Local works stay local until explicitly saved.
export function connectCloud({getState,getLibrary,setState,render,persistLocal,toast}) {
  const initialStoryId=new URL(location.href).searchParams.get('story');
  const versions=new Map(),baselines=new Map(),blocked=new Set();let user=null,timer=null,saving=false,pending=false,loading=false,savingId=null;
  const button=document.getElementById('cloudSave'),refresh=document.getElementById('cloudRefresh'),status=document.getElementById('cloudStatus');
  const signIn=document.getElementById('cloudSignIn');
  const dirty=id=>versions.has(id)&&baselines.get(id)!==JSON.stringify(getLibrary().find(s=>s.id===id));
  function update(message){const url=new URL(location.href);if(versions.has(getState().id))url.searchParams.set('story',getState().id);else url.searchParams.delete('story');history.replaceState(null,'',url);status.textContent=message||(user?(versions.has(getState().id)?blocked.has(getState().id)?'수정 충돌 · 내보내기 후 새 작품으로 보관':'계정 작품 · GPT와 같은 저장본':'이 브라우저의 작품 · 계정에 저장 가능'):'체험 작품은 이 브라우저에 저장됩니다.');button.hidden=!user;refresh.hidden=!user;signIn.hidden=Boolean(user);button.textContent=blocked.has(getState().id)?'새 계정 작품으로 보관':versions.has(getState().id)?'계정에 저장':'계정에 작품 저장';}
  async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await r.json();if(!r.ok){const e=new Error(data.message||'계정 저장소에 연결하지 못했습니다.');e.status=r.status;throw e}return data;}
  function changed(){update();if(versions.has(getState().id)&&!blocked.has(getState().id)){pending=true;clearTimeout(timer);timer=setTimeout(flush,650);}}
  async function flush(){if(saving||!user)return;saving=true;pending=false;try{for(const story of getLibrary().filter(s=>dirty(s.id)&&!blocked.has(s.id))){savingId=story.id;const snapshot=JSON.parse(JSON.stringify(story)),record=await api('/api/stories',{id:story.id,expected_version:versions.get(story.id),request_id:crypto.randomUUID(),story:snapshot});versions.set(story.id,record.version);baselines.set(story.id,JSON.stringify(record.story));
      // Accept server revision progression only if the user has not edited during saving.
      if(JSON.stringify(story)===JSON.stringify(snapshot))Object.assign(story,record.story);
    }update('계정에 저장됨 · GPT에서도 이어서 수정할 수 있습니다.');}catch(e){pending=false;if(e.status===409)blocked.add(savingId);update(e.status===409?'다른 곳의 수정과 충돌했습니다. 내 변경은 화면에 남아 있습니다.':'계정 저장 실패 · 내보내기로 보관해주세요.');toast(e.message);}finally{saving=false;if(pending)timer=setTimeout(flush,650);}}
  async function refreshAll(initial=false){if(loading||saving||!user)return;loading=true;try{const list=await api('/api/stories');for(const meta of list.items){if(versions.get(meta.id)===meta.version)continue;if(dirty(meta.id)||blocked.has(meta.id)){blocked.add(meta.id);continue}const record=await api('/api/stories?id='+encodeURIComponent(meta.id));const found=getLibrary().find(s=>s.id===record.id);if(found)Object.assign(found,record.story);else getLibrary().push(record.story);versions.set(record.id,record.version);baselines.set(record.id,JSON.stringify(record.story));}
      const requested=initialStoryId;if(initial&&requested){const found=getLibrary().find(s=>s.id===requested);if(found)setState(found);else toast('이 계정에서 해당 작품을 찾지 못했습니다.');}
      render();update();
    }catch(e){update('계정 작품을 불러오지 못했습니다. 브라우저 작품은 유지됩니다.');if(!initial)toast(e.message);}finally{loading=false;}}
  button.onclick=async()=>{if(saving)return;const current=getState();if(versions.has(current.id)&&!blocked.has(current.id)){await flush();return}button.disabled=true;try{const record=await api('/api/stories',{request_id:crypto.randomUUID(),story:current});getLibrary().push(record.story);versions.set(record.id,record.version);baselines.set(record.id,JSON.stringify(record.story));setState(record.story);persistLocal();render();update();toast('계정에 작품을 저장했습니다. GPT에서 같은 작품을 이어갈 수 있습니다.');}catch(e){toast(e.message);update(e.message);}finally{button.disabled=false;}};
  refresh.onclick=()=>refreshAll();
  document.getElementById('gptGuide').onclick=()=>{const d=document.getElementById('gptDialog');d.showModal();};
  document.getElementById('closeGptGuide').onclick=()=>document.getElementById('gptDialog').close();
  async function init(){try{const session=await api('/api/session');user=session.signed_in?session:null;update();await refreshAll(true);}catch{update('계정 연결을 확인하지 못했습니다. 브라우저 작품은 계속 편집할 수 있습니다.');}}
  init();const poll=setInterval(()=>{if(document.visibilityState==='visible')refreshAll();},15000);window.addEventListener('focus',()=>refreshAll());window.addEventListener('beforeunload',e=>{if(getLibrary().some(s=>dirty(s.id))){e.preventDefault();e.returnValue='';}});window.addEventListener('pagehide',()=>{clearInterval(poll);clearTimeout(timer);},{once:true});
  return {changed,isCloud:id=>versions.has(id),refresh:refreshAll};
}
