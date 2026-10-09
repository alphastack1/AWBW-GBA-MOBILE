"""Import a source-tracked AWBW asset pack, preserving original image bytes."""
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse
import hashlib
import json
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {'.png', '.gif', '.jpg', '.jpeg', '.webp', '.svg', '.avif', '.bmp'}

def import_pack(path):
    with zipfile.ZipFile(path) as pack:
        if sum(item.file_size for item in pack.infolist()) > 70 * 1024 * 1024:
            raise ValueError('Asset pack is larger than 70 MB')
        manifest = json.loads(pack.read('manifest.json'))
        if manifest.get('format') != 'field-command-assets-v1':
            raise ValueError('Unknown asset pack format')
        planned = {}
        for record in manifest['assets']:
            name = record['file']
            parts = PurePosixPath(name)
            if not re.fullmatch(r'assets/[a-zA-Z0-9._-]+', name) or parts.is_absolute() or '..' in parts.parts or len(parts.parts) != 2 or parts.parts[0] != 'assets' or parts.suffix.lower() not in EXTENSIONS:
                raise ValueError(f'Invalid asset path: {name}')
            source = urlparse(record['source'])
            if source.scheme != 'https' or source.netloc != 'awbw.amarriner.com':
                raise ValueError('Expected an AWBW public asset source')
            data = pack.read(name)
            if len(data) != record['size'] or hashlib.sha256(data).hexdigest() != record['sha256']:
                raise ValueError(f'Asset integrity check failed: {name}')
            planned[name] = data
        # Validate the complete pack before writing anything.
        for name, data in planned.items():
            destination = ROOT / name
            destination.parent.mkdir(exist_ok=True)
            destination.write_bytes(data)
        catalog = ROOT / 'assets/catalog.json'
        existing = json.loads(catalog.read_text()) if catalog.exists() else {'assets': []}
        merged = {item['source']: item for item in existing.get('assets', [])}
        merged.update({item['source']: item for item in manifest['assets']})
        manifest['assets'] = list(merged.values())
        catalog.write_text(json.dumps(manifest, indent=2) + '\n')
        print(f'Imported {len(planned)} original images into {ROOT / "assets"}; catalog contains {len(merged)} source records.')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: npm run import-assets -- /path/to/awbw-assets.zip')
    import_pack(sys.argv[1])
