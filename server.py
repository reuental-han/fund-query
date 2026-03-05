from flask import Flask, send_from_directory, jsonify
import os
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='.')

@app.route('/')
def index():
    try:
        return send_from_directory('.', 'index.html')
    except Exception as e:
        logger.error(f"Error serving index.html: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/<path:filename>')
def serve_static(filename):
    try:
        return send_from_directory('.', filename)
    except Exception as e:
        logger.error(f"Error serving {filename}: {e}")
        return jsonify({"error": str(e)}), 404

@app.errorhandler(500)
def handle_500(error):
    logger.error(f"500 Error: {error}")
    return jsonify({"error": "Internal Server Error"}), 500
