const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const C=require('../src/core.js');
function chars(text,y=700){return [...text].map((c,i)=>({c,rect:[40+i*5,y,45+i*5,y+10],spaceAfter:false}));}
test('validates unique categories and colors',()=>{assert.equal(C.categories(C.defaults).length,6);assert.throws(()=>C.categories([...C.defaults,C.defaults[0]]));assert.throws(()=>C.categories([{...C.defaults[0],color:'red'}]));});
test('sentence IDs point to original glyph coordinates across pages',()=>{const pages=[{chars:chars('A long scientific sentence that continues'),viewBox:[0,0,612,792]},{chars:chars('onto another page and ends here.'),viewBox:[0,0,612,792]}];const s=C.sentences(pages);assert.equal(s.length,1);assert.equal(s[0].position.pageIndex,0);assert.ok(s[0].position.nextPageRects.length);assert.ok(s[0].text.includes('onto another'));assert.match(s[0].sortIndex,/^00000\|000000\|/);});
test('rectangles never bridge two columns',()=>{const result=C.rects([{rect:[40,50,60,60]},{rect:[65,50,70,60]},{rect:[300,50,320,60]}]);assert.deepEqual(result,[[40,50,70,60],[300,50,320,60]]);});
test('unknown IDs and categories from a model cannot create highlights',()=>{const s={id:'S001',text:'Original text',position:{pageIndex:0,rects:[[0,0,2,2]]}};const aligned=C.align({annotations:[{sentence_id:'S001',category:'SOLN',confidence:9},{sentence_id:'S001',category:'PROB'},{sentence_id:'INVENTED',category:'SOLN'},{sentence_id:'S002',category:'INVALID'}]},[s],C.defaults);assert.equal(aligned.length,1);assert.equal(aligned[0].text,'Original text');assert.equal(aligned[0].confidence,1);assert.equal(aligned[0].status,'Draft');});
test('malformed JSON fails clearly; fenced JSON accepted',()=>{assert.deepEqual(C.parseJSON('```json\n{"annotations":[]}\n```'),{annotations:[]});assert.throws(()=>C.parseJSON('Sorry!'));assert.throws(()=>C.align({},[],C.defaults));});
test('deduplication ignores whitespace and tiny coordinate differences',()=>{const a={text:'hello  world',position:{pageIndex:0,rects:[[1,2,3,4]]}};assert.equal(C.fingerprint(a),C.fingerprint({...a,text:'hello world',position:{pageIndex:0,rects:[[1.01,2,3,4]]}}));});
test('chunks keep every sentence and honor budget boundaries',()=>{const items=Array.from({length:10},(_,i)=>({id:String(i),text:'x'.repeat(30)}));const chunks=C.chunks(items,150);assert.equal(chunks.length,5);assert.deepEqual(chunks.flat(),items);});
test('notes group original text by category and preserve comments',()=>{const md=C.markdown('Paper',[{category:'SOLN',text:'We propose a system.',pageLabel:'iii',source:'Manual',comment:'My thought'}],C.defaults);assert.match(md,/## Solution\n/);assert.doesNotMatch(md,/## SOLN|Folio 语义精读笔记/);assert.match(md,/> We propose a system\. ——piii\n/);assert.doesNotMatch(md,/Manual|— p\./);assert.match(md,/My thought/);});
function pluginEnv(){let saved=[];const attachment={id:5,libraryID:1,isEditable:()=>true,getAnnotations:()=>saved};const prefs=new Map();const context={FolioCore:C,URL,console,Intl,Zotero:{Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)},Items:{get:id=>id===5?attachment:saved.find(a=>a.id===id),getByLibraryAndKey:(_library,key)=>saved.find(a=>a.key===key)},DataObjectUtilities:{generateKey:()=> 'KEY'+saved.length},Annotations:{saveFromJSON:async(attachment,a)=>{if(!/^#[a-f0-9]{6}$/.test(a.color))throw Error('Native Zotero requires lowercase HEX');let tags=(a.tags||[]).map(t=>t.name);const item={id:100+saved.length,key:a.key,parentID:5,annotationType:a.type,annotationText:a.text,annotationColor:a.color,annotationComment:a.comment,annotationPageLabel:a.pageLabel,annotationSortIndex:a.sortIndex,annotationPosition:JSON.stringify(a.position),getTags:()=>tags.map(tag=>({tag})),addTag:tag=>{if(!tags.includes(tag))tags.push(tag);},removeTag:tag=>{tags=tags.filter(t=>t!==tag);},setTags:values=>{tags=values.map(t=>t.tag);},isEditable:()=>true,saveTx:async()=>{},save:async()=>{},erase:async()=>{saved.splice(saved.indexOf(item),1);}};saved.push(item);return item;}},logError:()=>{}}};context.Zotero.Item=function(){let tags=[];const item={loadPrimaryData:async()=>{},getTags:()=>tags.map(t=>({...t})),setTags:values=>{tags=values.map(t=>({...t}));},addTag:(tag,type=0)=>{if(!tags.some(t=>t.tag===tag))tags.push({tag,type});},removeTag:tag=>{tags=tags.filter(t=>t.tag!==tag);},isEditable:()=>true,addRelation(){},save:async()=>{if(!saved.includes(item)){item.id=Math.max(99,...saved.map(a=>a.id))+1;saved.push(item);}},erase:async()=>{saved.splice(saved.indexOf(item),1);}};item.saveTx=item.save;return item;};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/plugin.js'),'utf8'),context);return {P:context.FolioPlugin,saved,attachment,context};}
test('cloud requires explicit opt-in; remote HTTP and credential URLs are rejected',()=>{const {P}=pluginEnv();const c={endpoint:'https://example.com/v1',model:'test',provider:'compatible',allowRemote:false};assert.throws(()=>P.configURL(c));assert.equal(P.configURL({...c,allowRemote:true}),'https://example.com/v1');assert.throws(()=>P.configURL({...c,endpoint:'http://example.com',allowRemote:true}));assert.throws(()=>P.configURL({...c,endpoint:'https://user:password@example.com',allowRemote:true}));assert.equal(P.configURL({...c,endpoint:'http://127.0.0.1:11434'}),'http://127.0.0.1:11434');});
test('native save is idempotent and never overwrites an existing manual highlight',async()=>{const {P,saved}=pluginEnv();const s={itemID:5,categories:C.defaults};const a={text:'Original quote',category:'SOLN',source:'AI',position:{pageIndex:0,rects:[[10,10,20,20]]},pageLabel:'1'};const first=await P._test.save(s,a);const second=await P._test.save(s,{...a,category:'PROB'});assert.equal(saved.length,1);assert.equal(first.duplicate,false);assert.equal(second.duplicate,true);});
test('failure during batch apply retains only unsaved drafts for retry',async()=>{const {P,attachment,saved}=pluginEnv();let n=0;const original=attachment.isEditable;attachment.isEditable=()=>++n<2;const a={text:'Quote one',category:'SOLN',source:'AI',position:{pageIndex:0,rects:[[10,10,20,20]]},pageLabel:'1'};const b={...a,text:'Quote two'};const s={itemID:5,categories:C.defaults,drafts:[a,b],layers:new Set(),reader:{},panel:{render(){},filter(){return 'all';}},busBindings:[]};await assert.rejects(P._test.apply(s,[a,b]));assert.equal(saved.length,1);assert.equal(s.drafts.length,1);assert.equal(s.drafts[0].text,'Quote two');attachment.isEditable=original;});

function seedHighlight(env,{color='#ffd400',tags=[],text='A plain native highlight.',rects=[[10,10,80,20]]}={}){
  let tagList=[...tags];let saves=0;
  const item={id:100+env.saved.length,key:'NATIVE'+env.saved.length,parentID:5,annotationType:'highlight',annotationText:text,annotationColor:color,annotationComment:'My personal comment',annotationPosition:JSON.stringify({pageIndex:0,rects}),annotationPageLabel:'1',annotationSortIndex:'00000|000001|00000',
    isAnnotation:()=>true,isEditable:()=>true,getTags:()=>tagList.map(tag=>({tag})),addTag:tag=>{if(!tagList.includes(tag))tagList.push(tag);},removeTag:tag=>{tagList=tagList.filter(t=>t!==tag);},saveTx:async()=>{saves++;},saveCount:()=>saves};
  env.saved.push(item);return item;
}
function attachNotifierHarness(env){
  const {context}=env;let notify;
  context.setTimeout=setTimeout;context.clearTimeout=clearTimeout;
  context.Zotero.Items.getAsync=async id=>context.Zotero.Items.get(id);
  context.Zotero.File={getResourceAsync:async()=>''};
  context.Zotero.Reader={_readers:[],registerEventListener(){},unregisterEventListener(){}};
  context.Zotero.Notifier={registerObserver:observer=>{notify=observer.notify;return 'test-observer';},unregisterObserver(){}};
  context.Zotero.getMainWindow=()=>({setInterval:()=>1,clearInterval(){}});
  context.FolioPanel={mount:()=>({root:{isConnected:true,hidden:true},render(){},refresh(){},attach(){},destroy(){}})};
  return {notify:(...args)=>notify(...args),reader:{itemID:5,_iframeWindow:{document:{}}}};
}
test('all category-colored native highlights remain unclassified',()=>{
  const env=pluginEnv();for(const c of C.defaults)seedHighlight(env,{color:c.color.toLowerCase()});
  const annotations=env.P._test.nativeAnnotations({itemID:5,categories:C.defaults});
  assert.equal(annotations.length,0);assert.ok(env.saved.every(a=>a.getTags().length===0));
});
test('native add and color-change notifications never create semantic tags',async()=>{
  const env=pluginEnv(),item=seedHighlight(env),h=attachNotifierHarness(env);
  await env.P.start('file:///fixture/');env.P._test.session(h.reader,{},false);
  h.notify('add','item',[item.id]);await new Promise(resolve=>setTimeout(resolve,100));
  assert.deepEqual(item.getTags(),[]);assert.equal(item.saveCount(),0);
  item.annotationColor='#2ea8e5';h.notify('modify','item',[item.id]);await new Promise(resolve=>setTimeout(resolve,100));
  assert.deepEqual(item.getTags(),[]);assert.equal(item.saveCount(),0);
  assert.equal(env.P._test.nativeAnnotations({itemID:5,categories:C.defaults}).length,0);env.P.stop();
});
test('an explicit manual classification reuses an ordinary highlight and preserves its comment and tags',async()=>{
  const env=pluginEnv(),item=seedHighlight(env,{color:'#ff6666',tags:['my-research-tag']});
  const originalComment=item.annotationComment;
  const result=await env.P._test.save({itemID:5,categories:C.defaults},{source:'Manual',category:'SOLN',text:item.annotationText,position:JSON.parse(item.annotationPosition),pageLabel:'1'});
  assert.equal(result.duplicate,true);assert.equal(env.saved.length,1);assert.equal(item.annotationColor,'#2ea8e5');
  const tags=item.getTags().map(t=>t.tag);assert.ok(tags.includes('semantic:SOLN'));assert.ok(tags.includes('semantic:source:Manual'));assert.ok(tags.includes('my-research-tag'));
  assert.equal(item.annotationComment,originalComment);assert.equal(env.P._test.nativeAnnotations({itemID:5,categories:C.defaults})[0].category,'SOLN');
});
test('changing a classified highlight color keeps the explicitly chosen category',async()=>{
  const env=pluginEnv(),item=seedHighlight(env,{tags:['semantic:MOTV','semantic:managed:folio','semantic:source:Manual','semantic:reviewed:true']}),h=attachNotifierHarness(env);
  await env.P.start('file:///fixture/');env.P._test.session(h.reader,{},false);
  item.annotationColor='#a28ae5';h.notify('modify','item',[item.id]);await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(env.P._test.nativeAnnotations({itemID:5,categories:C.defaults})[0].category,'MOTV');assert.equal(item.annotationColor,'#a28ae5');assert.equal(item.saveCount(),0);env.P.stop();
});
test('a newly assigned semantic tag alone cannot turn a plain highlight into a Folio classification',()=>{
  const env=pluginEnv(),item=seedHighlight(env);const s={itemID:5,categories:C.defaults};
  assert.equal(env.P._test.nativeAnnotations(s).length,0);
  item.addTag('semantic:SOLN');item.addTag('semantic:source:Manual');item.addTag('semantic:reviewed:true');
  assert.equal(env.P._test.nativeAnnotations(s).length,0);
  item.addTag('semantic:managed:folio');assert.equal(env.P._test.nativeAnnotations(s)[0].category,'SOLN');
});
test('legacy category tags and migration preferences cannot bypass unbound mode',()=>{
  const env=pluginEnv(),old=seedHighlight(env,{tags:['semantic:MOTV','semantic:source:Manual']});const s={itemID:5,categories:C.defaults};
  env.context.Zotero.Prefs.set('extensions.folio.legacySemanticKeys041.5',JSON.stringify([old.key]),true);
  assert.equal(env.P._test.nativeAnnotations(s).length,0);
  assert.ok(old.getTags().some(t=>t.tag==='semantic:MOTV'));
  old.addTag('semantic:managed:folio');assert.equal(env.P._test.nativeAnnotations(s).length,1);
});
test('explicit manual and AI saves attach the Folio-origin marker',async()=>{
  const env=pluginEnv(),s={itemID:5,categories:C.defaults};
  env.P._test.nativeAnnotations(s);
  for(const source of ['Manual','AI'])await env.P._test.save(s,{text:'Explicit '+source+' classification.',category:'SOLN',source,position:{pageIndex:0,rects:[[10,10,80,20]]},pageLabel:'1'});
  assert.equal(env.P._test.nativeAnnotations(s).length,2);
  assert.ok(env.saved.every(item=>item.getTags().some(t=>t.tag==='semantic:managed:folio')));
});
test('color binding is opt-in and toggling it does not write annotation tags',()=>{
  const env=pluginEnv(),item=seedHighlight(env,{color:'#2ea8e5'}),s={itemID:5,categories:C.defaults,bindColors:false};
  assert.equal(env.P._test.nativeAnnotations(s).length,0);
  s.bindColors=true;const bound=env.P._test.nativeAnnotations(s);
  assert.equal(bound[0].category,'SOLN');assert.equal(bound[0].bindingOrigin,'color');assert.equal(bound[0].source,'Color');
  assert.deepEqual(item.getTags(),[]);assert.equal(item.saveCount(),0);
  s.bindColors=false;assert.equal(env.P._test.nativeAnnotations(s).length,0);
});
test('bound display follows color but unbound display restores explicit classification',()=>{
  const env=pluginEnv(),item=seedHighlight(env,{color:'#a28ae5',tags:['semantic:managed:folio','semantic:SOLN','semantic:source:Manual']}),s={itemID:5,categories:C.defaults,bindColors:false};
  assert.equal(env.P._test.nativeAnnotations(s)[0].category,'SOLN');
  s.bindColors=true;assert.equal(env.P._test.nativeAnnotations(s)[0].category,'LIMT');
  s.bindColors=false;assert.equal(env.P._test.nativeAnnotations(s)[0].category,'SOLN');
  assert.equal(item.annotationColor,'#a28ae5');assert.ok(item.getTags().some(t=>t.tag==='semantic:SOLN'));assert.equal(item.saveCount(),0);
});

test('export uses English category names only and preserves multiline Chinese comments',()=>{const entries=C.defaults.map(c=>({category:c.id,text:'Original quote.',pageLabel:'1',source:'Manual',comment:'第一行评论\n第二行评论'}));const md=C.markdown('Paper',entries,C.defaults);assert.deepEqual(md.split('\n').filter(l=>l.startsWith('## ')),C.defaults.map(c=>'## '+c.name));assert.equal(md.split('第一行评论\n第二行评论').length-1,6);assert.doesNotMatch(md,/Folio 语义精读笔记/);});

test('translation export includes all or only selected successful translations and always keeps comments',()=>{
 const env=pluginEnv();const native=['a','b','c'].map((id,i)=>({annotationID:id,category:'SOLN',text:'Quote '+id,pageLabel:String(i+1),source:'Manual',comment:'Comment '+id}));
 const cache=new Map([['a',{status:'success',result:'译文甲'}],['b',{status:'success',result:'译文乙'}],['c',{status:'error',result:'错误信息'}]]);
 env.context.FolioTranslation={get:(_s,a)=>cache.get(a.annotationID)};
 const s={native,categories:C.defaults};
 const plain=env.P._test.exportMarkdown(s,'Paper');assert.doesNotMatch(plain,/译文|错误信息|Manual|— p\./);assert.match(plain,/> Quote a ——p1\n/);
 const all=env.P._test.exportMarkdown(s,'Paper',{translations:'all'});assert.match(all,/译文甲/);assert.match(all,/译文乙/);assert.doesNotMatch(all,/错误信息/);
 const selected=env.P._test.exportMarkdown(s,'Paper',{translations:'selected',selected:['b','c','removed']});assert.doesNotMatch(selected,/译文甲|错误信息/);assert.match(selected,/译文乙/);
 for(const md of [plain,all,selected])for(const id of ['a','b','c'])assert.ok(md.includes('Comment '+id));
});

function credentialHarness(env,store=[]){
 env.context.Services={logins:{searchLoginsAsync:async q=>store.filter(x=>x.origin===q.origin&&x.httpRealm===q.httpRealm),addLoginAsync:async x=>{store.push(x);},modifyLogin:(old,next)=>{store.splice(store.indexOf(old),1,next);},removeLogin:x=>{store.splice(store.indexOf(x),1);}}};
 env.context.Components={interfaces:{nsILoginInfo:{}},Constructor:function(){return function(origin,_form,httpRealm,username,password){Object.assign(this,{origin,httpRealm,username,password});};}};
 env.context.Zotero.OSKeyStore={encrypt:async value=>'encrypted:'+value,decrypt:async value=>{assert.ok(value.startsWith('encrypted:'));return value.slice(10);}};
 return store;
}
const siliconConfig={provider:'siliconflow',endpoint:'https://api.siliconflow.cn/v1',model:'deepseek-ai/DeepSeek-V4-Pro',allowRemote:true};
test('model credentials persist across plugin instances, remain outside preferences and are scoped to the service',async()=>{
 const first=pluginEnv(),store=credentialHarness(first),s={};
 await first.P._test.configure(s,siliconConfig,'fixture-only-key');
 assert.equal(store.length,1);assert.equal(store[0].password,'encrypted:fixture-only-key');assert.equal(s.hasAPIKey,true);
 assert.equal(first.context.Zotero.Prefs.get('extensions.folio.config').includes('fixture-only-key'),false);
 const restarted=pluginEnv();credentialHarness(restarted,store);
 assert.equal(await restarted.P._test.loadKey(siliconConfig),'fixture-only-key');
 assert.equal(await restarted.P._test.loadKey({...siliconConfig,provider:'compatible'}),'fixture-only-key');
 assert.equal(await restarted.P._test.loadKey({...siliconConfig,endpoint:'https://other.example/v1'}),'');
 await restarted.P._test.configure({},siliconConfig,'');assert.equal(store.length,1);
 await restarted.P._test.storeKey(siliconConfig,'');assert.equal(store.length,0);
});
test('updating a key updates the shared configuration for all open PDFs and new PDFs inherit it',async()=>{
 const env=pluginEnv(),h=attachNotifierHarness(env);credentialHarness(env);
 await env.P.start('file:///fixture/');const one=env.P._test.session(h.reader,{},false);
 const two=env.P._test.session({itemID:6,_iframeWindow:{document:{}}},{},false);
 await env.P._test.configure(one,siliconConfig,'fixture-shared');
 assert.equal(two.hasAPIKey,true);assert.equal(two.config.model,siliconConfig.model);
 await env.P._test.configure(two,siliconConfig,'fixture-replacement');
 const three=env.P._test.session({itemID:7,_iframeWindow:{document:{}}},{},false);
 assert.equal(three.hasAPIKey,true);assert.equal(three.config.endpoint,siliconConfig.endpoint);
 assert.equal(await env.P._test.loadKey(one.config),'fixture-replacement');env.P.stop();
});
test('SiliconFlow requests use the compatible route, saved key, model and non-thinking JSON mode',async()=>{
 const env=pluginEnv();credentialHarness(env);await env.P._test.storeKey(siliconConfig,'fixture-request');let captured;
 env.context.Zotero.HTTP={request:async(method,url,options)=>{captured={method,url,headers:options.headers,body:JSON.parse(options.body)};return {response:{choices:[{message:{content:'{"ok":true}'}}]}};}};
 const result=await env.P._test.request({config:siliconConfig},[{role:'user',content:'Return JSON.'}]);
 assert.equal(result.ok,true);assert.equal(captured.url,'https://api.siliconflow.cn/v1/chat/completions');assert.equal(captured.headers.Authorization,'Bearer fixture-request');assert.equal(captured.body.model,siliconConfig.model);assert.equal(captured.body.enable_thinking,false);assert.equal(captured.body.response_format.type,'json_object');
 assert.equal(env.P.configURL({...siliconConfig,endpoint:siliconConfig.endpoint+'/chat/completions'}),siliconConfig.endpoint);
});
test('provider failures show HTTP details with secrets redacted, and unsupported JSON mode retries once',async()=>{
 const env=pluginEnv();credentialHarness(env);await env.P._test.storeKey(siliconConfig,'fixture-private');
 env.context.Zotero.HTTP={request:async()=>{throw {status:401,xmlhttp:{response:{error:{message:'Invalid key fixture-private'}}}};}};
 await assert.rejects(env.P._test.request({config:siliconConfig},[]),e=>/401/.test(e.message)&&/无效/.test(e.message)&&!e.message.includes('fixture-private'));
 let calls=0;env.context.Zotero.HTTP.request=async(_method,_url,options)=>{calls++;const payload=JSON.parse(options.body);if(calls===1){assert.ok(payload.response_format);throw {status:400,xmlhttp:{response:{message:'response_format json_object is unsupported'}}};}assert.equal(payload.response_format,undefined);return {response:{choices:[{message:{content:'{"ok":true}'}}]}};};
 assert.equal((await env.P._test.request({config:siliconConfig},[])).ok,true);assert.equal(calls,2);
});

test('rejecting a draft immediately refreshes the panel even when native annotations are unchanged',async()=>{
 const env=pluginEnv(),h=attachNotifierHarness(env);credentialHarness(env);let api,refreshes=0;
 env.context.FolioPanel.mount=(_doc,_s,actions)=>{api=actions;return {root:{isConnected:true,hidden:true},render(){},refresh(){refreshes++;},attach(){},destroy(){}};};
 const drafts=[{annotationID:'draft-one',status:'Draft',category:'SOLN',text:'First draft'},{annotationID:'draft-two',status:'Draft',category:'PROB',text:'Second draft'}];
 env.context.Zotero.Prefs.set('extensions.folio.drafts.5',JSON.stringify(drafts));
 await env.P.start('file:///fixture/');const s=env.P._test.session(h.reader,{},false);const before=refreshes;
 api.reject(s.drafts[0]);assert.equal(refreshes,before+1);assert.equal(s.native.length,0);assert.equal(s.drafts.length,1);assert.equal(s.drafts[0].annotationID,'draft-two');
 assert.equal(JSON.parse(env.context.Zotero.Prefs.get('extensions.folio.drafts.5')).length,1);env.P.stop();
});

function removalFixture(){
 const env=pluginEnv();let transactions=0;env.context.Zotero.DB={executeTransaction:async fn=>{transactions++;return fn();}};
 const ai=seedHighlight(env,{tags:['semantic:managed:folio','semantic:SOLN','semantic:source:AI','personal'],text:'AI evidence'});
 const manual=seedHighlight(env,{tags:['semantic:managed:folio','semantic:PROB','semantic:source:Manual','personal'],text:'Manual evidence'});
 const plain=seedHighlight(env,{tags:['personal'],text:'Ordinary highlight'});
 for(const item of env.saved){item.save=item.saveTx;item.erase=async()=>{env.saved.splice(env.saved.indexOf(item),1);};}
 const drafts=[{annotationID:'ai-draft',source:'AI',status:'Draft'},{annotationID:'manual-draft',source:'Manual',status:'Draft'}];
 const s={itemID:5,categories:C.defaults,drafts,native:[],layers:new Set(),reader:{},panel:{refresh(){},render(){}}};
 return {env,s,ai,manual,plain,transactions:()=>transactions};
}
test('bulk AI and manual removal delete only owned highlights of the selected source',async()=>{
 for(const scope of ['AI','Manual']){
  const f=removalFixture(),target=scope==='AI'?f.ai:f.manual,other=scope==='AI'?f.manual:f.ai;
  await f.env.P._test.removeAnnotations(f.s,scope);
  assert.equal(f.env.saved.length,2);assert.ok(!f.env.saved.includes(target));assert.ok(f.env.saved.includes(other));assert.ok(f.env.saved.includes(f.plain));assert.equal(f.plain.annotationComment,'My personal comment');assert.deepEqual(f.plain.getTags().map(t=>t.tag),['personal']);
  assert.equal(f.s.drafts.length,1);assert.notEqual(f.s.drafts[0].source,scope);assert.equal(f.transactions(),1);
 }
});
test('bulk all removal preserves same-color ordinary highlights even when color binding is enabled',async()=>{
 const f=removalFixture();f.s.bindColors=true;await f.env.P._test.removeAnnotations(f.s,'all');
 assert.equal(f.s.drafts.length,0);assert.equal(f.env.saved.length,1);assert.equal(f.env.saved[0],f.plain);assert.equal(f.plain.saveCount(),0);
 assert.equal(f.env.P._test.nativeAnnotations(f.s).length,1);assert.equal(f.env.P._test.nativeAnnotations(f.s)[0].annotationID,f.plain.key);
 assert.equal(JSON.parse(f.env.context.Zotero.Prefs.get('extensions.folio.drafts.5')).length,0);
});
test('bulk removal preflights read-only annotations and blocks while analysis or saving is running',async()=>{
 const f=removalFixture();f.manual.isEditable=()=>false;await assert.rejects(f.env.P._test.removeAnnotations(f.s,'all'),/不可编辑/);assert.equal(f.env.saved.length,3);assert.equal(f.transactions(),0);assert.equal(f.s.drafts.length,2);
 f.s.busy=true;await assert.rejects(f.env.P._test.removeAnnotations(f.s,'AI'),/等待/);assert.equal(f.env.saved.length,3);
});
test('restore recreates the deleted highlight with its key, position, color, comments and complete tags',async()=>{
 const f=removalFixture();f.ai.addTag('another personal tag');const key=f.ai.key,position=f.ai.annotationPosition;await f.env.P._test.removeAnnotations(f.s,'AI');assert.equal(f.env.P._test.canRestore(f.s),true);
 await f.env.P._test.restoreAnnotations(f.s);const restored=f.env.saved.find(a=>a.key===key);
 assert.ok(restored);assert.equal(restored.annotationComment,'My personal comment');assert.equal(restored.annotationColor,'#ffd400');assert.equal(restored.annotationPosition,position);assert.ok(restored.getTags().some(t=>t.tag==='another personal tag'));assert.ok(restored.getTags().some(t=>t.tag==='semantic:source:AI'));
 assert.equal(f.s.drafts.length,2);assert.equal(f.env.saved.length,3);assert.equal(f.env.P._test.canRestore(f.s),false);await f.env.P._test.restoreAnnotations(f.s);assert.equal(f.env.saved.length,3);
});
test('restore survives plugin reload and is scoped to the current PDF',async()=>{
 const f=removalFixture();await f.env.P._test.removeAnnotations(f.s,'all');
 vm.runInContext(fs.readFileSync(require.resolve('../src/plugin.js'),'utf8'),f.env.context);const restarted=f.env.context.FolioPlugin;
 assert.equal(restarted._test.canRestore({...f.s,itemID:6}),false);assert.equal(restarted._test.canRestore(f.s),true);
 await restarted._test.restoreAnnotations(f.s);assert.equal(f.s.native.length,2);assert.equal(f.s.drafts.length,2);assert.equal(restarted._test.canRestore(f.s),false);
});
test('restore never overwrites an existing key and avoids duplicate or edited drafts',async()=>{
 const f=removalFixture();await f.env.P._test.removeAnnotations(f.s,'AI');const backup=JSON.parse(f.env.context.Zotero.Prefs.get('extensions.folio.lastRemoval.5'));
 const changed=await f.env.context.Zotero.Annotations.saveFromJSON(f.env.attachment,{...backup.items[0].annotation,text:'Edited elsewhere',comment:'New comment',tags:[{name:'semantic:managed:folio'},{name:'semantic:INSG'},{name:'semantic:source:Manual'}]});
 f.s.drafts.push({annotationID:'ai-draft',source:'AI',comment:'New draft comment'});await f.env.P._test.restoreAnnotations(f.s);
 assert.equal(changed.annotationText,'Edited elsewhere');assert.equal(changed.annotationComment,'New comment');assert.ok(changed.getTags().some(t=>t.tag==='semantic:INSG'));assert.ok(!changed.getTags().some(t=>t.tag==='semantic:SOLN'));assert.equal(f.s.drafts.filter(a=>a.annotationID==='ai-draft').length,1);assert.equal(f.s.drafts.find(a=>a.annotationID==='ai-draft').comment,'New draft comment');
});
test('a new removal replaces the previous restore record and read-only restore preserves its backup',async()=>{
 const f=removalFixture();await f.env.P._test.removeAnnotations(f.s,'AI');await f.env.P._test.removeAnnotations(f.s,'Manual');
 f.env.attachment.isEditable=()=>false;await assert.rejects(f.env.P._test.restoreAnnotations(f.s),/不可编辑/);assert.equal(f.env.P._test.canRestore(f.s),true);
 f.env.attachment.isEditable=()=>true;await f.env.P._test.restoreAnnotations(f.s);assert.ok(f.env.saved.some(a=>a.key===f.manual.key));assert.ok(!f.env.saved.some(a=>a.key===f.ai.key));assert.equal(f.s.drafts.length,1);assert.equal(f.s.drafts[0].source,'Manual');
});
test('restoring a previous version tag-only removal preserves later edits',async()=>{
 const f=removalFixture(),item=f.ai,tags=item.getTags();f.env.context.Zotero.Prefs.set('extensions.folio.lastRemoval.5',JSON.stringify({version:1,items:[{key:item.key,tags:tags.filter(t=>t.tag.startsWith('semantic:'))}],drafts:[]}));
 for(const tag of item.getTags())if(tag.tag.startsWith('semantic:'))item.removeTag(tag.tag);item.addTag('semantic:excluded:true');item.annotationComment='Later edit';
 await f.env.P._test.restoreAnnotations(f.s);assert.equal(item.annotationComment,'Later edit');assert.ok(item.getTags().some(t=>t.tag==='semantic:SOLN'));
});
test('single-card removal also removes its highlight without affecting other records or drafts',async()=>{
 const f=removalFixture();await f.env.P._test.removeAnnotations(f.s,'all',f.ai.key);assert.equal(f.env.saved.length,2);assert.ok(f.env.saved.includes(f.plain));assert.ok(f.env.saved.includes(f.manual));assert.equal(f.s.drafts.length,2);
});

test('analysis always refreshes its idle button state when ending without native annotation changes',async()=>{
 const env=pluginEnv(),states=[];let updates=0,refreshes=0;
 const s={itemID:5,config:{provider:'ollama',endpoint:'http://127.0.0.1:11434',model:'test',allowRemote:false},categories:C.defaults,drafts:[],native:[],layers:new Set(),reader:{},panel:{render(){states.push(s.busy);},refresh(){refreshes++;states.push(s.busy);},updateAnalysis(){updates++;states.push(s.busy);}}};
 await env.P._test.analyze(s);assert.equal(s.busy,false);assert.equal(s.error,true);assert.equal(updates,1);assert.equal(refreshes,1);assert.equal(states.at(-1),false);
});

test('selected-text card follows the active reader selection and clears when selection ends',()=>{
 const env=pluginEnv();let cleared=0,refreshed=0;
 const first={text:'Current selected evidence.',position:{pageIndex:0,rects:[[1,2,3,4]]}},second={text:'Second pane evidence.',position:{pageIndex:1,rects:[[5,6,7,8]]}};
 const internal={_lastViewPrimary:true,_state:{primaryViewSelectionPopup:{annotation:first},secondaryViewSelectionPopup:{annotation:second}}};
 const s={reader:{_internalReader:internal},panel:{clearSelection(){cleared++;},refresh(){refreshed++;}}};
 assert.equal(env.P._test.syncSelection(s).text,first.text);internal._state.primaryViewSelectionPopup=null;assert.equal(env.P._test.syncSelection(s),null);assert.equal(s.selectionAnnotation,null);assert.equal(cleared,1);
 internal._lastViewPrimary=false;assert.equal(env.P._test.syncSelection(s).text,second.text);internal._state.secondaryViewSelectionPopup=null;assert.equal(env.P._test.syncSelection(s),null);assert.equal(cleared,2);const before=refreshed;env.P._test.syncSelection(s);assert.equal(refreshed,before);
});
test('deferred popup refresh cannot restore a selection that has already been cleared',async()=>{
 const env=pluginEnv(),h=attachNotifierHarness(env);credentialHarness(env);await env.P.start('file:///fixture/');
 const annotation={text:'A temporary selection.',position:{pageIndex:0,rects:[[1,2,3,4]]}};h.reader._internalReader={_lastViewPrimary:true,_state:{primaryViewSelectionPopup:{annotation}}};
 const s=env.P._test.session(h.reader,{},false);s.display.selectionMenu=false;
 env.P._test.selection({reader:h.reader,doc:h.reader._iframeWindow.document,params:{annotation},append(){}});h.reader._internalReader._state.primaryViewSelectionPopup=null;
 await new Promise(resolve=>setTimeout(resolve,180));assert.equal(s.selectionAnnotation,null);env.P.stop();
});
