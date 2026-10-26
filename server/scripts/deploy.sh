#!/usr/bin/env bash
# Pull, build the page, install dependencies, restart. Run as the eass user
# on the Oracle box: /opt/eass/server/scripts/deploy.sh
set -euo pipefail
cd /opt/eass/repo
git pull --ff-only
python3 src/build.py                     # index.html from the parts
cp index.html /opt/eass/web/index.html
rsync -a --delete server/app/ /opt/eass/server/app/
/opt/eass/venv/bin/pip install -q -r server/requirements.txt
sudo systemctl restart eass-api
sleep 2
curl -fsS http://127.0.0.1:8800/api/health && echo "  <- the API is up"
