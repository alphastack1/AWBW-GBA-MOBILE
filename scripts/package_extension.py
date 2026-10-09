"""Share one archive containing the unpacked Chrome extension and all artwork."""
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
with zipfile.ZipFile(root/'field-command-chrome.zip','w',zipfile.ZIP_DEFLATED) as pack:
    for file in sorted((root/'extension-dist').rglob('*')):
        if file.is_file():pack.write(file,Path('field-command-chrome')/file.relative_to(root/'extension-dist'))
print('Chrome extension ready: field-command-chrome.zip (extract, then Load unpacked)')
