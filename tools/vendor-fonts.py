"""Vendor Google Fonts WOFF2 subsets and their upstream OFL licenses."""
import hashlib
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'dist'
DEST = ROOT / 'fonts'
CSS_URL = ('https://fonts.googleapis.com/css2?family=Unbounded:wght@200..900'
           '&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap')
USER_AGENT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'


def download(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def main():
    DEST.mkdir(exist_ok=True)
    source = download(CSS_URL).decode('utf-8')
    blocks = []
    manifest = []
    for subset, block in re.findall(r'/\* ([\w-]+) \*/\s*(@font-face\s*\{[^}]+\})', source):
        if subset not in ('latin', 'latin-ext', 'vietnamese'):
            continue
        family = re.search(r"font-family: '([^']+)'", block)[1]
        weight = re.search(r'font-weight: ([^;]+)', block)[1]
        remote = re.search(r'url\(([^)]+)\)', block)[1]
        assert remote.startswith('https://fonts.gstatic.com/') and remote.endswith('.woff2')
        slug = family.lower().replace(' ', '-')
        filename = f"{slug}-{weight.replace(' ', '-')}-{subset}.woff2"
        data = download(remote)
        assert data[:4] == b'wOF2', 'Expected a WOFF2 file'
        (DEST / filename).write_bytes(data)
        blocks.append(f'/* {family}: {subset} */\n' + block.replace(remote, 'fonts/' + filename))
        manifest.append({'file': filename, 'source': remote, 'sha256': hashlib.sha256(data).hexdigest()})
    assert len(blocks) == 15, 'Unexpected font subset response'
    for family in ('unbounded', 'bevietnampro'):
        (DEST / f'{family}-OFL.txt').write_bytes(download(
            f'https://raw.githubusercontent.com/google/fonts/main/ofl/{family}/OFL.txt'))
    (ROOT / 'fonts.css').write_text('\n\n'.join(blocks) + '\n', encoding='utf-8')
    (DEST / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Vendored {len(manifest)} font subsets with licenses.')


if __name__ == '__main__':
    main()
