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
    let tab='annotations',filter='all',source='all';
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
      const modes=el('div','folio-modes');for(const [id,name] of [['Manual','人工标注'],['AI','AI 自动'],['Hybrid','人机协作']])modes.append(button(name,state.mode===id?'active':'',()=>{state.mode=id;api.persist();render();}));body.append(modes);
      if(state.mode!=='Manual') {
        const box=el('section','folio-analyze');
        const row=el('div','folio-analyze-row');row.append(select([['core','核心'],['balanced','均衡'],['comprehensive','完整']],state.density,v=>{state.density=v;api.persist();}));
        const run=button(state.busy?'分析中…':'分析论文','folio-primary',()=>api.analyze());run.disabled=state.busy;row.append(run);box.append(row);
        if(state.busy)box.append(button('取消分析','folio-text',()=>api.cancel()));body.append(box);
      }
      if(state.selectionAnnotation?.text&&state.mode!=='AI'){
        const selected=el('section','folio-selected');selected.append(el('div','folio-section-title','选中文本'));
        selected.append(el('p','folio-selection-text',state.selectionAnnotation.text.slice(0,120)));
        const choices=el('div','folio-selection-choices');for(const c of state.categories){const b=button(c.id,'folio-badge',()=>api.annotateSelection(c.id));b.style.background=c.color;b.title=c.label;choices.append(b);}selected.append(choices);body.append(selected);
      }
      if(state.message){const msg=el('div',state.error?'folio-error':'folio-status',state.message);msg.setAttribute('role','status');body.append(msg);}
      if(state.busy){const p=el('progress');p.max=100;p.value=state.progress||0;body.append(p);}
      const title=el('div','folio-section-title');title.append(el('span','','分类'),el('span','folio-small',state.native.length+' 已保存 '+state.drafts.length+' 草稿'));body.append(title);
      const cats=el('div','folio-categories');
      for(const c of state.categories){const count=[...state.native,...state.drafts].filter(a=>a.category===c.id).length;const b=button('','folio-category'+(filter===c.id?' active':''),()=>{filter=filter===c.id?'all':c.id;render();api.overlay();});b.title=c.definition;b.style.setProperty('--category',c.color);b.append(el('i'),el('b','',c.id),el('span','',c.label),el('em','',String(count)));cats.append(b);}body.append(cats);
      const display=el('div','folio-display');for(const [k,t] of [['labels','页边标签'],['highlights','草稿高亮']]){const n=input('','checkbox');n.checked=state.display[k];n.onchange=()=>{state.display[k]=n.checked;api.persist();api.overlay();};const l=el('label');l.append(n,doc.createTextNode(t));display.append(l);}body.append(display);
      const listHead=el('div','folio-section-title');listHead.append(el('span','','标注'),select([['all','全部来源'],['Draft','待审核'],['AI','AI'],['Manual','人工']],source,v=>{source=v;render();}));body.append(listHead);
      const entries=[...state.drafts,...state.native].filter(a=>(filter==='all'||a.category===filter)&&(source==='all'||(source==='Draft'?a.status==='Draft':a.source===source)));
      const list=el('div','folio-list');
      if(!entries.length)list.append(el('div','folio-empty','暂无标注'));
      for(const a of entries){const c=state.categories.find(c=>c.id===a.category);if(!c)continue;const card=el('article','folio-card');card.style.setProperty('--category',c.color);card.setAttribute('data-annotation-id',a.annotationID);
        const meta=el('div','folio-card-meta');if(a.status==='Draft'){const check=input('','checkbox');check.checked=a.selected;check.title='选择此草稿';check.onchange=()=>{a.selected=check.checked;api.cache();render();};meta.append(check);}const go=button(c.id,'folio-badge',()=>api.navigate(a));go.style.background=c.color;meta.append(go,el('span','','p. '+a.pageLabel),el('span','folio-source',a.status==='Draft'?'AI 草稿'+(a.confidence!==null?' '+Math.round(a.confidence*100)+'%':''):a.source==='AI'?'AI 已确认':'人工'));card.append(meta);
        const quote=button(a.text,'folio-quote',()=>api.navigate(a));card.append(quote);if(a.reason && a.status==='Draft')card.append(el('p','folio-reason',a.reason));
        const actions=el('div','folio-card-actions');const cat=select(state.categories.map(c=>[c.id,c.id+'｜'+c.label]),a.category,async v=>{try{await api.reclassify(a,v);render();}catch(e){api.error(e);}});cat.title='修改分类';actions.append(cat);
        if(a.status==='Draft'){actions.append(button('接受','folio-text',()=>api.apply([a])),button('拒绝','folio-text muted',()=>api.reject(a)));}else actions.append(button('移除语义标签','folio-text muted',()=>api.untag(a)));
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
        }
        translationViews.set(a.annotationID,updateTranslation);updateTranslation();
        translationRow.append(translateButton);card.append(translationRow,translationBox);
        const comment=el('textarea','folio-comment');comment.rows=1;comment.placeholder='添加评论…';comment.value=a.comment||'';comment.setAttribute('aria-label','个人评论');comment.onchange=()=>api.comment(a,comment.value).catch(api.error);card.append(comment);list.append(card);
      }body.append(list);
      const footer=el('footer','folio-footer');const apply=button('保存选中草稿'+(state.drafts.length?' '+state.drafts.filter(a=>a.selected).length:''),'folio-primary',()=>api.apply(state.drafts.filter(a=>a.selected)));apply.disabled=state.busy||!state.drafts.some(a=>a.selected);footer.append(apply,button('导出笔记','folio-secondary',api.export));footerHost.append(footer);
    }
    function settings(){
      body.append(el('h2','','模型'));
      const config={...state.config};
      const provider=select([['ollama','Ollama 本地'],['compatible','OpenAI 兼容接口']],config.provider,v=>config.provider=v);body.append(field('模型服务',provider));
      const endpoint=input(config.endpoint);endpoint.placeholder='http://127.0.0.1:11434';body.append(field('服务地址（兼容接口填至 /v1）',endpoint));
      const model=input(config.model);body.append(field('模型名称',model));
      const key=input('','password');key.autocomplete='off';key.placeholder=state.apiKey?'已设置 仅当前会话保留':'可选 仅当前会话保留';body.append(field('API Key',key));
      const cloud=input('','checkbox');cloud.checked=config.allowRemote;const permission=el('label','folio-consent');permission.append(cloud,doc.createTextNode('允许向远程服务发送当前论文文本'));body.append(permission);
      body.append(button('保存模型设置','folio-primary',async()=>{config.endpoint=endpoint.value.trim();config.model=model.value.trim();config.allowRemote=cloud.checked;await api.config(config,key.value);state.message='模型设置已保存';state.error=false;tab='annotations';render();}));
      body.append(el('h2','folio-settings-title','分类配置'));
      const editor=el('textarea','folio-json');editor.rows=15;editor.value=JSON.stringify(state.categories,null,2);editor.spellcheck=false;editor.setAttribute('aria-label','分类配置 JSON');body.append(editor);
      const row=el('div','folio-settings-actions');row.append(button('应用分类','folio-secondary',async()=>{await api.categories(FolioCore.categories(JSON.parse(editor.value)));render();}),button('导出配置','folio-text',()=>api.exportCategories()),button('恢复默认','folio-text',()=>{editor.value=JSON.stringify(FolioCore.defaults,null,2);}));body.append(row);
      const upload=input('','file');upload.accept='.json';upload.onchange=async()=>{try{editor.value=await upload.files[0].text();}catch(e){api.error(e);}};body.append(field('导入分类 JSON（导入后点击应用）',upload));
      if(state.message)body.append(el('div',state.error?'folio-error':'folio-status',state.message));
    }
    let pendingRefresh=false;
    function refresh(){
      if(tab==='settings')return;
      if(root.contains(doc.activeElement)&&doc.activeElement.matches('input,textarea,select')){pendingRefresh=true;return;}
      render();
    }
    root.addEventListener('focusout',()=>win.setTimeout(()=>{if(pendingRefresh&&!root.contains(doc.activeElement)){pendingRefresh=false;refresh();}},0));
    function attach(){if(!link.isConnected)doc.head.append(link);if(!root.isConnected)doc.body.append(root);}
    attach();render();
    return {root,render,refresh,attach,layout,setCollapsed,updateTranslations(){for(const update of translationViews.values())update();},filter:()=>filter,destroy(){dragCleanup?.();win.removeEventListener('resize',onResize);root.remove();link.remove();}};
  }
  return {mount};
})();
