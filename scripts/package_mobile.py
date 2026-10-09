"""Package the same one-file mobile integration and readable setup guide for friends."""
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
with zipfile.ZipFile(root/'field-command-mobile.zip','w',zipfile.ZIP_DEFLATED) as pack:
    pack.write(root/'awbw-bridge.user.js','field-command-mobile/awbw-bridge.user.js')
    pack.write(root/'docs/legacy-browser-integration.md','field-command-mobile/INSTALL.md')
print('Mobile bundle ready: field-command-mobile.zip (script includes all artwork)')
