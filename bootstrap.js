var FolioCore, FolioPanel, FolioTranslation, FolioPlugin;
async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  for (let file of ['core', 'translation', 'panel', 'plugin']) {
    Services.scriptloader.loadSubScriptWithOptions(rootURI + 'src/' + file + '.js', {target:this,ignoreCache:true});
  }
  await FolioPlugin.start(rootURI);
}
function shutdown() { FolioPlugin?.stop(); }
function install() {}
function uninstall() {}
