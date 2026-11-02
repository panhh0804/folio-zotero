var FolioPanel = (() => {
  function mount(doc, state, api, cssText) {
    const el = (tag, cls, text) => {const n=doc.createElementNS('http://www.w3.org/1999/xhtml',tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
    const root=el('aside','folio-panel');root.setAttribute('aria-label','Folio 语义标注');
    const link=el('style');link.textContent=cssText;doc.head.append(link);
    const head=el('header','folio-head');const brand=el('div','folio-brand');brand.append(el('span','','Folio'));
    const controls=el('div','folio-window-controls');const collapse=el('button','folio-collapse','−');collapse.type='button';collapse.title='收起为小窗';collapse.setAttribute('aria-label','收起为小窗');
    const close=el('button','folio-icon','×');close.title='关闭 Folio';close.onclick=()=>api.visibility(false);controls.append(collapse,close);head.append(brand,controls);root.append(head);
    const tabs=el('nav','folio-tabs');const body=el('div','folio-body');const footerHost=el('div','folio-bottom');root.append(tabs,body,footerHost);
    const win=doc.defaultView;
    const pointerDocs=new Set();
    function finishComment(event){const editor=doc.activeElement;if(editor?.matches('.folio-comment,.folio-api-key')&&(!event||event.target!==editor))editor.blur();}
    function watchCommentExit(targetDoc){
      if(!pointerDocs.has(targetDoc)){targetDoc.addEventListener('pointerdown',finishComment,true);pointerDocs.add(targetDoc);}
      for(const frame of targetDoc.querySelectorAll('iframe')){try{if(frame.contentDocument)watchCommentExit(frame.contentDocument);}catch{}}
    }
    win.addEventListener('blur',finishComment);
    // Reader keyboard shortcuts must not consume typing in Folio editors.
    for(const type of ['keydown','keyup','keypress'])root.addEventListener(type,event=>{if(event.target.matches('input,textarea,select')||event.target.isContentEditable)event.stopPropagation();});
    const pendingComments=new Map();let commentTimer,commentWrites=Promise.resolve();
    function flushComments(){
      win.clearTimeout(commentTimer);
      const task=commentWrites.catch(()=>{}).then(async()=>{const changes=[...pendingComments.entries()];pendingComments.clear();for(let i=0;i<changes.length;i++){const [,change]=changes[i];try{await api.comment(change.annotation,change.text);}catch(e){for(const [key,remaining] of changes.slice(i))if(!pendingComments.has(key))pendingComments.set(key,remaining);throw e;}}});
      commentWrites=task;return task;
    }
    let normal={width:370,height:Math.max(240,win.innerHeight-56),left:Math.max(8,win.innerWidth-378),top:48,...state.panelLayout};
    let collapsed=!!normal.collapsed,dragCleanup;
    const handles=['left','right'].map(side=>{const n=el('div','folio-resize folio-resize-'+side);n.setAttribute('role','separator');n.setAttribute('aria-label','调整窗口大小');n.tabIndex=0;root.append(n);return n;});
    function persistLayout(){api.layout({...normal,collapsed});}
    function layout(value={}){
      normal={...normal,...value};
      const availableWidth=Math.max(120,win.innerWidth-16),availableHeight=Math.max(42,win.innerHeight-56);
      normal.width=Math.min(availableWidth,Math.max(Math.min(320,availableWidth),normal.width));
      normal.height=Math.min(availableHeight,Math.max(Math.min(240,availableHeight),normal.height));
      const width=collapsed?Math.min(190,availableWidth):normal.width,height=collapsed?42:normal.height;
      const left=Math.max(8,Math.min(normal.left,win.innerWidth-width-8)),top=Math.max(40,Math.min(normal.top,win.innerHeight-height-8));
      root.style.width=width+'px';root.style.height=height+'px';root.style.left=left+'px';root.style.top=top+'px';root.style.right='auto';root.style.bottom='auto';
      root.classList.toggle('is-collapsed',collapsed);root.setAttribute('data-collapsed',String(collapsed));
      tabs.hidden=collapsed;body.hidden=collapsed;for(const n of handles)n.hidden=collapsed;
      collapse.textContent=collapsed?'□':'−';collapse.title=collapsed?'展开':'收起为小窗';collapse.setAttribute('aria-label',collapse.title);collapse.setAttribute('aria-expanded',String(!collapsed));
      return {width,height,left,top};
    }
    function setCollapsed(value){collapsed=value;layout();persistLayout();}
    collapse.onclick=()=>setCollapsed(!collapsed);
    function startGesture(event,side){
      if(event.button!==0||(!side&&event.target.closest('button')))return;
      event.preventDefault();const target=event.currentTarget;try{target.setPointerCapture(event.pointerId);}catch{}
      const initial=root.getBoundingClientRect(),x=event.clientX,y=event.clientY;
      const move=e=>{const dx=e.clientX-x,dy=e.clientY-y;
        if(!side)layout({left:initial.left+dx,top:initial.top+dy});
        else if(side==='left'){
          const minWidth=Math.min(320,win.innerWidth-16),width=Math.max(minWidth,initial.width-dx);
          layout({width,left:initial.right-width,height:initial.height+dy});
        }else layout({width:initial.width+dx,height:initial.height+dy});
      };
      const finish=()=>{try{target.releasePointerCapture(event.pointerId);}catch{}win.removeEventListener('pointermove',move);win.removeEventListener('pointerup',finish);win.removeEventListener('pointercancel',finish);dragCleanup=null;persistLayout();};
      dragCleanup?.();dragCleanup=finish;
      win.addEventListener('pointermove',move);win.addEventListener('pointerup',finish);win.addEventListener('pointercancel',finish);
    }
    head.onpointerdown=e=>startGesture(e);
    handles.forEach((n,i)=>{n.onpointerdown=e=>startGesture(e,i===0?'left':'right');n.onkeydown=e=>{
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();layout({width:normal.width+(e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0),height:normal.height+(e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0)});persistLayout();}
    };});
    const onResize=()=>layout();win.addEventListener('resize',onResize);layout();
    let tab='annotations',filter='all',source='all',exportTranslations='all',exportTranslationEnabled=false;
    const selectedTranslations=new Set();
    const translationViews=new Map();
    const button=(text,cls,fn)=>{const n=el('button',cls,text);n.type='button';n.onclick=()=>Promise.resolve().then(fn).catch(api.error);return n;};
    const field=(label,input)=>{const wrap=el('label','folio-field');wrap.append(el('span','',label),input);return wrap;};
    const select=(items,value,fn)=>{const n=el('select');for(const [v,t] of items){const o=el('option','',t);o.value=v;n.append(o);}n.value=value;n.onchange=()=>fn(n.value);return n;};
    const input=(value,type='text')=>{const n=el('input');n.type=type;n.value=value||'';return n;};
    const tabA=button('标注','',()=>{tab='annotations';render();});const tabB=button('设置','',()=>{tab='settings';render();});tabs.append(tabA,tabB);
    function render() {
      if(!root.isConnected) return;
      translationViews.clear();
      tabA.className=tab==='annotations'?'active':'';tabB.className=tab==='settings'?'active':'';body.replaceChildren();footerHost.replaceChildren();footerHost.hidden=tab==='settings';
      if(tab==='settings') { settings(); return; }
      const modes=el('div','folio-modes');for(const [id,name] of [['Manual','人工标注'],['AI','AI 自动']])modes.append(button(name,state.mode===id?'active':'',()=>{state.mode=id;api.persist();render();}));body.append(modes);
      if(state.mode!=='Manual') {
        const box=el('section','folio-analyze');
        const row=el('div','folio-analyze-row');row.append(select([['core','核心'],['balanced','均衡'],['comprehensive','完整']],state.density,v=>{state.density=v;api.persist();}));
        const run=button(state.busy?'分析中…':'分析论文','folio-primary',()=>api.analyze());run.disabled=state.busy;row.append(run);box.append(row);
        if(state.busy)box.append(button('取消分析','folio-text',()=>api.cancel()));body.append(box);
      }
      if(state.selectionAnnotation?.text){
        const selected=el('section','folio-selected');selected.append(el('div','folio-section-title','选中文本'));
        selected.append(el('p','folio-selection-text',state.selectionAnnotation.text.slice(0,120)));
        const choices=el('div','folio-selection-choices');for(const c of state.categories){const b=button(c.id,'folio-badge',()=>api.annotateSelection(c.id));b.style.background=c.color;b.title=c.label;choices.append(b);}selected.append(choices);body.append(selected);
      }
      if(state.message){const msg=el('div',state.error?'folio-error':'folio-status',state.message);msg.setAttribute('role','status');if(!state.error&&state.message.startsWith('已移除 ')&&api.canRestore()){const undo=button('恢复','folio-text',async()=>{await flushComments();await api.restoreAnnotations();});undo.setAttribute('data-restore-removal','true');undo.style.marginLeft='8px';msg.append(undo);}body.append(msg);}
      if(state.busy){const p=el('progress');p.max=100;p.value=state.progress||0;body.append(p);}
      const title=el('div','folio-section-title');title.append(el('span','','分类'),el('span','folio-small',state.native.length+' 已保存 '+state.drafts.length+' 草稿'));body.append(title);
      const cats=el('div','folio-categories');
      for(const c of state.categories){const count=[...state.native,...state.drafts].filter(a=>a.category===c.id).length;const b=button('','folio-category'+(filter===c.id?' active':''),()=>{filter=filter===c.id?'all':c.id;render();api.overlay();});b.title=c.definition;b.style.setProperty('--category',c.color);b.append(el('i'),el('b','',c.id),el('span','',c.label),el('em','',String(count)));cats.append(b);}body.append(cats);
      const display=el('div','folio-display');for(const [k,t] of [['labels','页边标签'],...(state.mode==='Manual'?[]:[['highlights','草稿高亮']])]){const n=input('','checkbox');n.checked=state.display[k];n.onchange=()=>{state.display[k]=n.checked;api.persist();api.overlay();};const l=el('label');l.append(n,doc.createTextNode(t));display.append(l);}
      const binding=input('','checkbox');binding.checked=state.bindColors===true;binding.setAttribute('data-setting','bind-colors');binding.onchange=()=>api.binding(binding.checked);
      const bindingLabel=el('label');bindingLabel.title='开启后按高亮颜色显示分类；关闭后只显示明确选择的分类';bindingLabel.append(binding,doc.createTextNode('颜色绑定'));display.append(bindingLabel);body.append(display);
      const exportRow=el('div','folio-export-options');const exportToggle=input('','checkbox');exportToggle.checked=exportTranslationEnabled;exportToggle.onchange=()=>{exportTranslationEnabled=exportToggle.checked;render();};
      const exportLabel=el('label');exportLabel.append(exportToggle,doc.createTextNode('导出译文'));exportRow.append(exportLabel);
      const exportSelect=select([['all','全部译文'],['selected','指定译文']],exportTranslations,v=>{exportTranslations=v;render();});exportSelect.setAttribute('aria-label','译文导出范围');exportSelect.disabled=!exportTranslationEnabled;exportSelect.style.visibility=exportTranslationEnabled?'visible':'hidden';exportSelect.setAttribute('aria-hidden',String(!exportTranslationEnabled));exportSelect.tabIndex=exportTranslationEnabled?0:-1;exportRow.append(exportSelect);
      exportRow.title='仅导出已生成的译文';display.append(exportRow);
      const listHead=el('div','folio-section-title');listHead.append(el('span','','标注'));
      const listControls=el('div','folio-list-controls');listControls.append(select([['all','全部来源'],['Draft','待审核'],['AI','AI'],['Manual','人工']],source,v=>{source=v;render();}));
      const bulk=el('details','folio-bulk');const summary=el('summary','','批量移除');summary.title='移除当前 PDF 的 Folio 标注及对应高亮；普通高亮保留，可恢复';bulk.append(summary);const menu=el('div','folio-bulk-menu');
      for(const [scope,label] of [['AI','移除 AI 标注'],['Manual','移除人工标注'],['all','移除全部标注']]){const action=button(label,'',async()=>{bulk.open=false;action.disabled=true;try{await flushComments();await api.removeAnnotations(scope);}finally{action.disabled=false;}});action.setAttribute('data-remove-scope',scope);action.disabled=state.busy||state.saving||state.removing||!api.removalCount(scope);menu.append(action);}
      if(api.canRestore()){const restore=button('恢复上次移除','',async()=>{bulk.open=false;restore.disabled=true;try{await flushComments();await api.restoreAnnotations();}finally{restore.disabled=false;}});restore.setAttribute('data-restore-removal','true');restore.disabled=state.busy||state.saving||state.removing;menu.append(restore);}
      bulk.append(menu);listControls.append(bulk);listHead.append(listControls);body.append(listHead);
      const entries=[...state.drafts,...state.native].filter(a=>(filter==='all'||a.category===filter)&&(source==='all'||(source==='Draft'?a.status==='Draft':a.source===source)));
      const list=el('div','folio-list');
      if(!entries.length)list.append(el('div','folio-empty','暂无标注'));
      for(const a of entries){const c=state.categories.find(c=>c.id===a.category);if(!c)continue;const card=el('article','folio-card');card.style.setProperty('--category',c.color);card.setAttribute('data-annotation-id',a.annotationID);
        const meta=el('div','folio-card-meta');if(a.status==='Draft'){const check=input('','checkbox');check.checked=a.selected;check.title='选择此草稿';check.onchange=()=>{a.selected=check.checked;api.cache();render();};meta.append(check);}const go=button(c.id,'folio-badge',()=>api.navigate(a));go.style.background=c.color;meta.append(go,el('span','','p. '+a.pageLabel),el('span','folio-source',a.status==='Draft'?'AI 草稿'+(a.confidence!==null?' '+Math.round(a.confidence*100)+'%':''):a.source==='AI'?'AI 已确认':a.source==='Color'?'颜色':'人工'));card.append(meta);
        const quote=button(a.text,'folio-quote',()=>api.navigate(a));card.append(quote);if(a.reason && a.status==='Draft')card.append(el('p','folio-reason',a.reason));
        const actions=el('div','folio-card-actions');const cat=select(state.categories.map(c=>[c.id,c.id+'｜'+c.label]),a.category,async v=>{try{await api.reclassify(a,v);render();}catch(e){api.error(e);}});cat.title='修改分类';actions.append(cat);
        if(a.status==='Draft'){actions.append(button('接受','folio-text',()=>api.apply([a])),button('拒绝','folio-text',()=>api.reject(a)));}else if(a.source!=='Color')actions.append(button('移除标注','folio-text muted',()=>api.untag(a)));
        card.append(actions);
        const translationRow=el('div','folio-translation-actions'),translationBox=el('div','folio-translation');
        translationBox.setAttribute('role','status');translationBox.setAttribute('aria-live','polite');
        const translateButton=button('翻译','folio-text folio-translate-button',async()=>{
          const entry=api.translation(a);
          if(entry.status==='success'){entry.visible=!entry.visible;updateTranslation();return;}
          const task=api.translate(a);updateTranslation();await task;updateTranslation();
        });
        function updateTranslation(){
          const entry=api.translation(a),loading=entry.status==='loading';
          translateButton.disabled=loading;
          translateButton.textContent=loading?'翻译中…':entry.status==='success'?(entry.visible?'收起译文':'显示译文'):entry.status==='error'?'重试翻译':'翻译';
          translateButton.setAttribute('aria-expanded',String(entry.visible));
          translationBox.hidden=!entry.visible;
          translationBox.classList.toggle('has-error',entry.status==='error');
          translationBox.textContent=loading?'正在翻译…':entry.status==='error'?entry.error:entry.result;
          if(exportCheck){exportCheck.disabled=entry.status!=='success';exportCheck.checked=entry.status==='success'&&selectedTranslations.has(a.annotationID);}
        }
        let exportCheck;
        if(exportTranslationEnabled&&exportTranslations==='selected'&&a.status!=='Draft'){
          exportCheck=input('','checkbox');exportCheck.setAttribute('data-export-translation',a.annotationID);exportCheck.onchange=()=>{if(exportCheck.checked)selectedTranslations.add(a.annotationID);else selectedTranslations.delete(a.annotationID);};
          const choice=el('label','folio-export-choice');choice.append(exportCheck,doc.createTextNode('导出译文'));translationRow.append(choice);
        }
        translationViews.set(a.annotationID,updateTranslation);updateTranslation();
        translationRow.prepend(translateButton);card.append(translationRow,translationBox);
        const comment=el('textarea','folio-comment');comment.rows=2;comment.placeholder='添加评论…';comment.value=pendingComments.get(a.annotationID)?.text??a.comment??'';comment.setAttribute('aria-label','个人评论');
        // Zotero's capturing keyboard manager recognizes this attribute, but
        // does not recognize a plain textarea as a text editor.
        comment.setAttribute('contenteditable','true');comment.onfocus=()=>api.editComment();
        comment.oninput=()=>{a.comment=comment.value;pendingComments.set(a.annotationID,{annotation:a,text:comment.value});win.clearTimeout(commentTimer);commentTimer=win.setTimeout(()=>flushComments().catch(api.error),400);};
        comment.onblur=()=>flushComments().catch(api.error);card.append(comment);list.append(card);
      }body.append(list);
      const footer=el('footer','folio-footer');
      if(state.mode!=='Manual'&&state.drafts.length){const apply=button('保存选中草稿 '+state.drafts.filter(a=>a.selected).length,'folio-primary',async()=>{await flushComments();await api.apply(state.drafts.filter(a=>a.selected));});apply.disabled=state.busy||!state.drafts.some(a=>a.selected);footer.append(apply);}
      footer.append(button('导出笔记','folio-secondary',async()=>{await flushComments();await api.export({translations:exportTranslationEnabled?exportTranslations:'none',selected:[...selectedTranslations]});}));footerHost.append(footer);
    }
    function settings(){
      body.append(el('h2','','模型'));
      const config={...state.config};
      const provider=select([['ollama','Ollama 本地'],['siliconflow','硅基流动'],['compatible','OpenAI 兼容接口']],config.provider,v=>{config.provider=v;if(v==='siliconflow'){endpoint.value='https://api.siliconflow.cn/v1';model.value='deepseek-ai/DeepSeek-V4-Pro';}else if(v==='ollama'){endpoint.value='http://127.0.0.1:11434';model.value='qwen3:8b';}});body.append(field('模型服务',provider));
      const endpoint=input(config.endpoint);endpoint.placeholder='http://127.0.0.1:11434';body.append(field('服务地址（兼容接口填至 /v1）',endpoint));
      const model=input(config.model);body.append(field('模型名称',model));
      const key=input('','password');key.className='folio-api-key';key.autocomplete='off';body.append(field('API Key（加密保存，所有 PDF 共用）',key));
      const cloud=input('','checkbox');cloud.checked=config.allowRemote;const permission=el('label','folio-consent');permission.append(cloud,doc.createTextNode('允许向远程服务发送当前论文文本'));body.append(permission);
      async function saveModel(){config.endpoint=endpoint.value.trim();config.model=model.value.trim();config.allowRemote=cloud.checked;await api.config(config,key.value);key.value='';}
      const modelActions=el('div','folio-settings-actions');const saveModelButton=button('保存模型设置','folio-primary',async()=>{await saveModel();state.message='模型设置已保存';state.error=false;tab='annotations';render();});
      const testModelButton=button('测试连接','folio-secondary',async()=>{testModelButton.disabled=true;saveModelButton.disabled=true;try{await saveModel();await api.testModel();}finally{testModelButton.disabled=false;saveModelButton.disabled=false;}});modelActions.append(saveModelButton,testModelButton);body.append(modelActions);
      if(state.hasAPIKey)body.append(button('清除已保存的 Key','folio-text',async()=>{await api.clearKey();state.message='已清除保存的 API Key';state.error=false;render();}));
      body.append(el('h2','folio-settings-title','分类配置'));
      const editor=el('textarea','folio-json');editor.rows=15;editor.value=JSON.stringify(state.categories,null,2);editor.spellcheck=false;editor.setAttribute('aria-label','分类配置 JSON');body.append(editor);
      const row=el('div','folio-settings-actions');row.append(button('应用分类','folio-secondary',async()=>{await api.categories(FolioCore.categories(JSON.parse(editor.value)));render();}),button('导出配置','folio-text',()=>api.exportCategories()),button('恢复默认','folio-text',()=>{editor.value=JSON.stringify(FolioCore.defaults,null,2);}));body.append(row);
      const upload=input('','file');upload.accept='.json';upload.onchange=async()=>{try{editor.value=await upload.files[0].text();}catch(e){api.error(e);}};body.append(field('导入分类 JSON（导入后点击应用）',upload));
      if(state.message)body.append(el('div',state.error?'folio-error':'folio-status',state.message));
    }
    let pendingRefresh=false;
    function updateAnalysis(){
      const run=body.querySelector('.folio-analyze-row .folio-primary');if(run){run.textContent=state.busy?'分析中…':'分析论文';run.disabled=state.busy;}
      const cancel=body.querySelector('.folio-analyze>.folio-text');if(cancel)cancel.hidden=!state.busy;
      const progress=body.querySelector('progress');if(progress)progress.hidden=!state.busy;
    }
    function refresh(){
      if(tab==='settings')return;
      if(root.contains(doc.activeElement)&&doc.activeElement.matches('input,textarea,select')){pendingRefresh=true;return;}
      render();
    }
    root.addEventListener('focusout',()=>win.setTimeout(()=>{if(pendingRefresh&&!root.contains(doc.activeElement)){pendingRefresh=false;refresh();}},0));
    function attach(){if(!link.isConnected)doc.head.append(link);if(!root.isConnected)doc.body.append(root);watchCommentExit(doc);}
    attach();render();
    return {root,render,refresh,attach,layout,setCollapsed,flushComments,updateAnalysis,clearSelection(){body.querySelector('.folio-selected')?.remove();},updateTranslations(){for(const update of translationViews.values())update();},filter:()=>filter,destroy(){flushComments().catch(api.error);dragCleanup?.();win.removeEventListener('resize',onResize);win.removeEventListener('blur',finishComment);for(const d of pointerDocs){try{d.removeEventListener('pointerdown',finishComment,true);}catch{}}pointerDocs.clear();root.remove();link.remove();}};
  }
  return {mount};
})();
