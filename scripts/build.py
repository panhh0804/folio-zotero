"""Build a dependency-free Zotero XPI; only explicitly listed source files ship."""
from pathlib import Path
import zipfile,json,runpy
root=Path(__file__).resolve().parent.parent
runpy.run_path(str(root/'scripts/audit-public.py'))['audit']()
version=json.loads((root/'manifest.json').read_text())['version']
if json.loads((root/'package.json').read_text())['version'] != version:
    raise SystemExit('package.json and manifest.json versions must match.')
output=root/'dist'/f'Folio-{version}.xpi'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for file in ['manifest.json','bootstrap.js','src/core.js','src/translation.js','src/panel.js','src/plugin.js','src/style.css','LICENSE','NOTICE']:
        archive.write(root/file,file)
print(output)
