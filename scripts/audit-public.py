"""Audit staged/tracked publication files without printing potential secrets."""
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
names = [name for name in names if name]
if not names:
    raise SystemExit('No public files are staged or tracked.')

patterns = {
    'private key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'GitHub token': re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})'),
    'provider key': re.compile(rb'\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}'),
    'AWS access key': re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'personal home path': re.compile(rb'(?:[/]Users[/][A-Za-z0-9._ -]+[/]|[/]home[/][A-Za-z0-9._-]+[/]|[A-Z]:\\Users\\[A-Za-z0-9._ -]+\\)'),
}
blocked_suffixes = {'.log', '.sqlite', '.xpi', '.zip', '.pem', '.key', '.p12', '.pfx'}
issues = []
for name in names:
    path = Path(name)
    if (any(part.startswith('.test') for part in path.parts)
            or path.parts[0] in {'verification', 'dist', 'node_modules'}
            or path.name.startswith('.env') and path.name != '.env.example'
            or path.suffix in blocked_suffixes):
        issues.append((name, 'private/generated file path'))
        continue
    # Inspect the exact indexed version as well as current working content.
    indexed = subprocess.check_output(['git', 'show', ':' + name], cwd=root)
    working = (root / name).read_bytes()
    for label, pattern in patterns.items():
        if pattern.search(indexed) or pattern.search(working):
            issues.append((name, label))
    # Inline URL credentials are forbidden except explicit synthetic example.com tests.
    for content in (indexed, working):
        for match in re.finditer(rb'https?://[^/\s\x27\x22]+:[^/\s\x27\x22]+@([^/\s\x27\x22]+)', content):
            if not (name.startswith('tests/') and match.group(1) == b'example.com'):
                issues.append((name, 'inline URL credentials'))
if issues:
    for name, label in sorted(set(issues)):
        print(f'{name}: {label}', file=sys.stderr)
    raise SystemExit('Public-file audit failed; potential sensitive values were not printed.')
print(f'Public-file audit passed for {len(names)} files.')
