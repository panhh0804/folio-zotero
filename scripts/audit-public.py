"""Check publication candidates and staged blobs without printing secret values."""
from pathlib import Path
import argparse
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_FILES = {
    '.gitignore', 'LICENSE', 'README.md', 'README.en.md', 'bootstrap.js', 'manifest.json',
    'package.json', 'scripts/audit-public.py', 'scripts/build.py',
    'scripts/package-source.py', 'src/core.js', 'src/panel.js',
    'src/plugin.js', 'src/style.css', 'src/translation.js',
    'tests/core.test.cjs', 'tests/translation.test.cjs',
    'tests/publication.test.cjs',
    'NOTICE',
    'docs/media/overview.png', 'docs/media/margin-labels.png',
    'docs/media/export-notes.png', 'docs/media/model-settings.png',
    'docs/media/category-settings.png', 'docs/media/manual-annotation.gif',
    'docs/media/ai-review.gif',
}
PATTERNS = {
    'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----',
    'GitHub token': rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})',
    'provider key': rb'\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}',
    'AWS access key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'Google API key': rb'\bAIza[A-Za-z0-9_-]{30,}',
    'Slack token': rb'\bxox[baprs]-[A-Za-z0-9-]{20,}',
    'personal home path': rb'(?:[/]Users[/][A-Za-z0-9._ -]+[/]|[/]home[/][A-Za-z0-9._-]+[/]|[A-Z]:\\Users\\[A-Za-z0-9._ -]+\\)',
    'private network URL': rb'https?://(?:10\.[0-9.]+|192\.168\.[0-9.]+|172\.(?:1[6-9]|2[0-9]|3[01])\.[0-9.]+)(?=[:/\s])',
}


def git(*args, check=True):
    try:
        return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, check=check)
    except FileNotFoundError:
        if check:
            raise
        return subprocess.CompletedProcess(['git', *args], 127, b'', b'')


def has_repository():
    result = git('rev-parse', '--show-toplevel', check=False)
    return result.returncode == 0 and Path(result.stdout.decode().strip()).resolve() == ROOT


def publication_files():
    if has_repository():
        names = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').stdout
        return sorted(set(filter(None, names.decode().split('\0'))))
    # A downloaded source ZIP has no Git metadata.
    return sorted(name for name in PUBLIC_FILES if (ROOT / name).exists())


def content_issues(name, content):
    issues = [label for label, pattern in PATTERNS.items() if re.search(pattern, content)]
    for match in re.finditer(rb'https?://[^/\s\x27\x22]+:[^/\s\x27\x22]+@([^/\s\x27\x22]+)', content):
        if not (name.startswith('tests/') and match.group(1) == b'example.com'):
            issues.append('inline URL credentials')
    assignments = rb'''(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)["']?\s*[:=]\s*["']([^"'\r\n]{12,})["']'''
    for match in re.finditer(assignments, content, re.IGNORECASE):
        value = match.group(1).lower()
        synthetic = name.startswith('tests/') and value.startswith((b'fixture-', b'encrypted:fixture-'))
        placeholder = value in {b'your_api_key', b'your-api-key', b'placeholder-value'}
        if not synthetic and not placeholder:
            issues.append('literal credential value')
    return issues


def audit(history=False):
    names = publication_files()
    issues = []
    repository = has_repository()
    if not names:
        raise SystemExit('No publication files found.')
    for name in names:
        if name not in PUBLIC_FILES:
            issues.append((name, 'not in public source allowlist'))
            continue
        path = ROOT / name
        if path.is_symlink():
            issues.append((name, 'symbolic link is not publication source'))
            continue
        if not path.is_file():
            issues.append((name, 'publication file is missing'))
            continue
        contents = [path.read_bytes()]
        if name.startswith('docs/media/'):
            expected = b'\x89PNG\r\n\x1a\n' if path.suffix == '.png' else (b'GIF87a', b'GIF89a')
            if not contents[0].startswith(expected):
                issues.append((name, 'invalid publication media format'))
            if len(contents[0]) > 8 * 1024 * 1024:
                issues.append((name, 'publication media exceeds 8 MiB'))
        if repository:
            indexed = git('show', ':' + name, check=False)
            if indexed.returncode == 0:
                contents.append(indexed.stdout)
            mode = git('ls-files', '--stage', '--', name).stdout
            if mode.startswith(b'120000 '):
                issues.append((name, 'indexed symbolic link'))
        for content in contents:
            issues.extend((name, label) for label in content_issues(name, content))
    history_blobs = 0
    if history and repository:
        seen = set()
        for commit in git('rev-list', '--all').stdout.decode().splitlines():
            for entry in git('ls-tree', '-r', '-z', commit).stdout.split(b'\0'):
                if not entry:
                    continue
                metadata, raw_name = entry.split(b'\t', 1)
                mode, kind, oid = metadata.split()
                name = raw_name.decode()
                if name not in PUBLIC_FILES or mode == b'120000':
                    issues.append((name, 'non-public file in Git history'))
                    continue
                if kind != b'blob' or oid in seen:
                    continue
                seen.add(oid)
                history_blobs += 1
                content = git('cat-file', 'blob', oid.decode()).stdout
                issues.extend((name, 'Git history: ' + label) for label in content_issues(name, content))
    if issues:
        for name, label in sorted(set(issues)):
            print(f'{name}: {label}', file=sys.stderr)
        raise SystemExit('Public-file audit failed; potential secret values were not printed.')
    print(f'Public-file audit passed for {len(names)} files.' +
          (f' Checked {history_blobs} historical blobs.' if history else ''))
    return names


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--history', action='store_true', help='Also scan all local Git history')
    audit(history=parser.parse_args().history)
