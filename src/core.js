/* Pure semantic model: shared by the reader integration and regression tests. */
var FolioCore = (() => {
  const defaults = [
    ['MOTV','Motivation','研究动机','#FFD400','研究背景、价值，以及为什么值得研究'],
    ['PROB','Problem','研究问题','#F19837','现有方法的具体不足与待解决挑战'],
    ['INSG','Insight','关键洞察','#FF6666','重要观察、规律与理论发现'],
    ['SOLN','Solution','解决方案','#2EA8E5','作者提出的架构、算法、机制和训练策略'],
    ['RSLT','Results','实验结果','#5FB236','实验验证、性能指标、消融与泛化结论'],
    ['LIMT','Limitation','研究局限','#A28AE5','方法限制、适用边界和实验不足']
  ].map(([id,name,label,color,definition]) => ({id,name,label,color,definition}));
  function categories(value) {
    if (!Array.isArray(value) || !value.length) throw Error('至少保留一个分类');
    const ids = new Set(), colors = new Set();
    return value.map(c => {
      const id = String(c.id || '').trim().toUpperCase();
      const color = String(c.color || '').toUpperCase();
      if (!/^[A-Z][A-Z0-9_]{1,9}$/.test(id) || ids.has(id)) throw Error('分类缩写须为 2–10 位英文字母/数字，且不能重复');
      if (!/^#[0-9A-F]{6}$/.test(color) || colors.has(color)) throw Error('请为每个分类使用不同的 HEX 颜色');
      if (!c.name?.trim() || !c.definition?.trim()) throw Error('请填写分类名称和语义定义');
      ids.add(id); colors.add(color);
      return {id, color, name:c.name.trim(), label:String(c.label || c.name).trim(), definition:c.definition.trim()};
    });
  }
  const norm = s => String(s || '').replace(/\s+/g,' ').trim();
  function fingerprint(a) {
    return JSON.stringify([a.position.pageIndex,norm(a.text),(a.position.rects || []).map(r => r.map(n => Math.round(n * 2) / 2))]);
  }
  function rects(chars) {
    const out = [];
    for (const c of chars) {
      if (!c.rect || c.ignorable) continue;
      const r = [Math.min(c.rect[0],c.rect[2]),Math.min(c.rect[1],c.rect[3]),Math.max(c.rect[0],c.rect[2]),Math.max(c.rect[1],c.rect[3])];
      const last = out[out.length - 1];
      if (last && Math.abs(last[1]-r[1]) < 2 && Math.abs(last[3]-r[3]) < 2 && r[0] - last[2] < 12 && r[0] >= last[0]-1) {
        last[2] = Math.max(last[2],r[2]); last[3] = Math.max(last[3],r[3]);
      } else out.push(r);
    }
    return out;
  }
  function sentences(pages) {
    // Zotero's character stream supplies reading order and actual glyph geometry.
    const stream = []; let text = '';
    for (let p=0;p<pages.length;p++) {
      const chars = pages[p].chars || [];
      for (let i=0;i<chars.length;i++) {
        const c = chars[i]; if(c.ignorable) continue;
        const str = c.c || c.u || '';
        for (const ch of str.split('')) { text += ch; stream.push({c,p,i}); }
        if(c.spaceAfter || c.lineBreakAfter || c.paragraphBreakAfter) { text += c.paragraphBreakAfter ? '\n' : ' '; stream.push(null); }
      }
      text += ' '; stream.push(null);
    }
    const segments = [...new Intl.Segmenter('en',{granularity:'sentence'}).segment(text)];
    const out = [];
    for (const s of segments) {
      const str = norm(s.segment); if(str.length < 20) continue;
      const refs = stream.slice(s.index,s.index+s.segment.length).filter(Boolean);
      if(!refs.length) continue;
      // A very long segment is usually headings or a malformed text stream.
      if(str.length > 3500) continue;
      const first = refs[0], last = refs[refs.length-1];
      if(last.p > first.p+1) continue;
      const position = {pageIndex:first.p,rects:rects([...new Set(refs.filter(r=>r.p===first.p).map(r=>r.c))])};
      if(last.p!==first.p) position.nextPageRects = rects([...new Set(refs.filter(r=>r.p===last.p).map(r=>r.c))]);
      if(!position.rects.length) continue;
      const top = Math.max(0,(pages[first.p].viewBox?.[3] || 792)-position.rects[0][3]);
      out.push({id:'S'+String(out.length+1).padStart(5,'0'), text:str, pageLabel:String(pages[first.p].label || first.p+1), position,
        sortIndex:[String(first.p).padStart(5,'0'),String(first.i).padStart(6,'0'),String(Math.floor(top)).padStart(5,'0')].join('|')});
    }
    return out;
  }
  function chunks(items, budget=14000) {
    const out=[]; let group=[], size=0;
    for(const s of items) {const n=s.text.length+40; if(size+n>budget && group.length) {out.push(group);group=[];size=0;} group.push(s);size+=n;}
    if(group.length) out.push(group); return out;
  }
  const densityProfiles = {
    core:{label:'核心',ratio:0.06,rule:'Keep only statements essential to reconstruct the central contribution: the specific research gap, the main novel idea or mechanism, the decisive finding, and a limitation only when it materially changes the conclusion. Omit general background, secondary methods, implementation details, routine experiments, and minor observations. Prefer one strong statement over several supporting statements.'},
    balanced:{label:'均衡',ratio:0.12,rule:'Cover the main argument: motivation and specific problem, key insights, major method components, representative evidence, and meaningful limitations where present. Include supporting statements only when needed to understand or assess a main claim. Omit routine implementation details, repetitive experiments, and minor observations.'},
    comprehensive:{label:'完整',ratio:0.22,rule:'Cover the main argument plus distinct supporting contributions: important method components, consequential implementation or training choices, informative ablations, quantitative comparisons, generalization findings, and explicit applicability boundaries. Retain a supporting detail only if it adds a new mechanism, evidence, condition, or caveat. Omit boilerplate, exhaustive experiment listings, and repeated claims. Comprehensive does not mean highlighting every sentence.'}
  };
  function densityProfile(value) {return densityProfiles[value] || densityProfiles.balanced;}
  function densityBudget(value,count,candidates=false) {
    const n=Math.max(0,Math.floor(Number(count)||0));
    return Math.min(n,Math.ceil(n*densityProfile(value).ratio*(candidates?3:1)));
  }
  function densityInstructions(value) {
    const p=densityProfile(value);
    return 'Annotation density: '+p.label+'. '+p.rule+' Approximate upper bound: '+Math.round(p.ratio*100)+'% of supplied document sentences in the final annotations. This is a ceiling, not a quota: return fewer or none when evidence is weak. Do not invent missing categories or force equal category counts. Judge semantic importance, not keywords or section titles. Preserve distinct evidence across the paper while merging repeated claims.';
  }
  function limitAnnotations(items,limit) {
    // Only prune model-selected evidence; never manufacture annotations to fill a budget.
    const unique=[],seen=new Set();
    for(const a of items){const key=norm(a.text);if(!seen.has(key)){seen.add(key);unique.push(a);}}
    const cap=Math.max(0,Math.floor(limit));if(unique.length<=cap)return unique;
    const remaining=unique.map((a,i)=>({a,i})),chosen=[],categories=new Map(),pages=new Map();
    while(chosen.length<cap&&remaining.length){
      remaining.sort((x,y)=>{
        const score=x=>(categories.get(x.a.category)||0)*2+(pages.get(x.a.position?.pageIndex)||0);
        return score(x)-score(y)||(y.a.confidence??0)-(x.a.confidence??0)||x.i-y.i;
      });
      const x=remaining.shift();chosen.push(x);categories.set(x.a.category,(categories.get(x.a.category)||0)+1);pages.set(x.a.position?.pageIndex,(pages.get(x.a.position?.pageIndex)||0)+1);
    }
    return chosen.sort((a,b)=>a.i-b.i).map(x=>x.a);
  }
  function parseJSON(text) {
    const clean = String(text).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
    try {return JSON.parse(clean);} catch {throw Error('模型返回的内容不是有效 JSON，请换用支持 JSON 的模型后重试');}
  }
  function align(result, items, cats) {
    if(!Array.isArray(result?.annotations)) throw Error('模型响应缺少 annotations 数组');
    const byID=new Map(items.map(s=>[s.id,s])), ids=new Set(cats.map(c=>c.id)), seen=new Set();
    return result.annotations.map(a=>{
      const s=byID.get(a.sentence_id);
      if(!s || !ids.has(a.category) || seen.has(s.id)) return null;
      seen.add(s.id);
      return {...s,annotationID:'draft-'+s.id,category:a.category,source:'AI',status:'Draft',selected:true,
        confidence:Number.isFinite(a.confidence)?Math.max(0,Math.min(1,a.confidence)):null,reason:String(a.reason||''),comment:''};
    }).filter(Boolean);
  }
  function labelColor(hex,alpha=0.6) {
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    return 'rgba('+rgb.join(',')+','+alpha+')';
  }
  function labelBorderColor(hex,category) {
    if(category!=='INSG')return labelColor(hex,0.8);
    const rgb=[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*0.45+142*0.55));
    return 'rgba('+rgb.join(',')+',0.6)';
  }
  function tags(category, source, reviewed=true) {
    return [{name:'semantic:'+category},{name:'semantic:managed:folio'},{name:'semantic:source:'+source},...(reviewed?[{name:'semantic:reviewed:true'}]:[])];
  }
  function markdown(title, annotations, cats, translations=new Map()) {
    const out=['# '+title,''];
    for(const c of cats) {
      const group=annotations.filter(a=>a.category===c.id); if(!group.length) continue;
      out.push('## '+c.name,'');
      for(const a of group) out.push('> '+norm(a.text)+' ——p'+a.pageLabel,...(translations.get(a.annotationID)?['',translations.get(a.annotationID)]:[]),...(a.comment?['',a.comment]:[]),'');
    }
    return out.join('\n');
  }
  return {defaults,categories,norm,fingerprint,rects,sentences,chunks,densityProfile,densityBudget,densityInstructions,limitAnnotations,parseJSON,align,labelColor,labelBorderColor,tags,markdown};
})();
if(typeof module !== 'undefined') module.exports = FolioCore;
