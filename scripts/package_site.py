"""Create a ready-to-extract static deployment archive, with no secrets or dependencies."""
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
with zipfile.ZipFile(root/'field-command-site.zip','w',zipfile.ZIP_DEFLATED) as pack:
    for file in sorted((root/'dist').rglob('*')):
        if file.is_file():pack.write(file,Path('field-command-site')/file.relative_to(root/'dist'))
print('Ready for Netlify Drop: field-command-site.zip (extract and upload the folder)')
