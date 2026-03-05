from flask import Flask, send_file, jsonify
import os
from pathlib import Path

app = Flask(__name__, static_folder='.')

@app.route('/')
def index():
    try:
        return send_file('index.html', mimetype='text/html')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/<path:filename>')
def serve_static(filename):
    try:
        file_path = Path(filename)
        if '..' in str(file_path) or str(file_path).startswith('/'):
            return jsonify({"error": "Invalid path"}), 400
        
        if file_path.exists() and file_path.is_file():
            return send_file(str(file_path))
        else:
            return jsonify({"error": "File not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
