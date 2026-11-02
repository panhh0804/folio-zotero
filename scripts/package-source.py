"""Create a source archive from Git-tracked public files only."""
from pathlib import Path
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
files = subprocess.check_output(
    ['git', 'ls-files', '-z'], cwd=root
).decode().split('\0')
files = [name for name in files if name]
if not files:
    raise SystemExit('Stage the public source files before packaging.')
subprocess.run(['python3', 'scripts/audit-public.py'], cwd=root, check=True)
output = root / 'dist' / f'Folio-source-{version}.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, 'Folio/' + name)
print(output)
