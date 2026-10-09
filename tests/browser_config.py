"""Run browser checks against this checkout even while another local server is active."""
import os
BROWSER_BASE_URL=os.environ.get('FIELD_COMMAND_BASE_URL','http://localhost:5173').rstrip('/')
