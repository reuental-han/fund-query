from flask import Flask, jsonify
import os
from pathlib import Path

app = Flask(__name__)

@app.route('/')
def index():
    try:
        with open('index.html', 'rb') as f:
            return f.read(), 200, {'Content-Type': 'text/html; charset=utf-8'}
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/<path:filename>')
def serve_static(filename):
    try:
        file_path = Path(filename)
        
        if '..' in str(file_path) or str(file_path).startswith('/'):
            return jsonify({"error": "Invalid path"}), 400
        
        if file_path.exists() and file_path.is_file():
            with open(file_path, 'rb') as f:
                content = f.read()
            
            mime_types = {
                '.html': 'text/html; charset=utf-8',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
            }
            
            ext = Path(filename).suffix.lower()
            content_type = mime_types.get(ext, 'application/octet-stream')
            
            return content, 200, {'Content-Type': content_type}
        else:
            return jsonify({"error": "File not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
