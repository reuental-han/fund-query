#!/bin/bash
echo "==== DEBUG INFO ===="
echo "PORT env: $PORT"
echo "All env vars: $(env | grep -i port)"
echo "==================="
python -c "
import os
port = int(os.environ.get('PORT', 8080))
print(f'Starting Flask on port: {port}')
from server import app
app.run(host='0.0.0.0', port=port)
"
