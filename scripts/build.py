"""Build a dependency-free Zotero XPI; only explicitly listed source files ship."""
from pathlib import Path
import zipfile,json
root=Path(__file__).resolve().parent.parent
version=json.loads((root/'manifest.json').read_text())['version']
output=root/'dist'/f'Folio-{version}.xpi'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for file in ['manifest.json','bootstrap.js','src/core.js','src/translation.js','src/panel.js','src/plugin.js','src/style.css']:
        archive.write(root/file,file)
print(output)
