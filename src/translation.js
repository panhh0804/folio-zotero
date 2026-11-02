/* Translate for Zotero's public API. Results stay in the reading session. */
var FolioTranslation = (() => {
  function settings(){
    const get=name=>Zotero.Prefs.get('extensions.zotero.ZoteroPDFTranslate.'+name,true)||'';
    return {service:get('translateSource'),from:get('sourceLanguage'),to:get('targetLanguage')};
  }
  function get(state,annotation){
    state.translations ||= new Map();
    const config=settings(),key=annotation.annotationID;
    const signature=JSON.stringify([annotation.text,config.service,config.from,config.to]);
    let entry=state.translations.get(key);
    if(!entry||entry.signature!==signature){
      entry={signature,status:'idle',visible:false,result:'',error:'',promise:null};
      state.translations.set(key,entry);
    }
    return entry;
  }
  function translate(state,annotation){
    const entry=get(state,annotation);entry.visible=true;
    if(entry.status==='loading')return entry.promise;
    if(entry.status==='success')return Promise.resolve(entry);
    const provider=Zotero.PDFTranslate;
    if(!provider?.data?.alive||typeof provider.api?.translate!=='function'){
      entry.status='error';entry.error='请先启用 Translate for Zotero。';return Promise.resolve(entry);
    }
    const raw=String(annotation.text||'').trim();
    if(!raw){entry.status='error';entry.error='这条标注没有可翻译的原文。';return Promise.resolve(entry);}
    entry.status='loading';entry.error='';
    entry.promise=(async()=>{
      try{
        // A custom API task does not write to the annotation's text or comments.
        const response=await provider.api.translate(raw,{pluginID:'folio@folio.local',itemID:state.itemID});
        if(response?.status!=='success'||!String(response.result||'').trim())throw Error(response?.result||'未收到译文，请检查翻译服务设置。');
        entry.result=String(response.result);entry.status='success';
      }catch(e){entry.status='error';entry.error=String(e.message||e).slice(0,1500);}
      finally{entry.promise=null;}
      return entry;
    })();
    return entry.promise;
  }
  return {get,translate};
})();
if(typeof module!=='undefined')module.exports=FolioTranslation;
