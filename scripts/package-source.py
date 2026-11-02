"""Create a source archive from audited, explicitly approved publication files."""
from pathlib import Path
import json
import runpy
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
files = runpy.run_path(str(root / 'scripts/audit-public.py'))['audit']()
output = root / 'dist' / f'Folio-source-{version}.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, 'Folio/' + name)
print(output)
