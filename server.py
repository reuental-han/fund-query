from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)

FUNDS_FILE = 'funds.json'
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_funds():
    funds_path = os.path.join(BASE_DIR, FUNDS_FILE)
    if os.path.exists(funds_path):
        with open(funds_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if data and isinstance(data[0], str):
                return [{'code': code, 'shares': None} for code in data]
            return data
    return []

def save_funds(funds):
    funds_path = os.path.join(BASE_DIR, FUNDS_FILE)
    with open(funds_path, 'w', encoding='utf-8') as f:
        json.dump(funds, f, ensure_ascii=False, indent=2)

def get_fund_codes(funds):
    return [f['code'] if isinstance(f, dict) else f for f in funds]

def find_fund_index(funds, code):
    for i, f in enumerate(funds):
        fund_code = f['code'] if isinstance(f, dict) else f
        if fund_code == code:
            return i
    return -1

@app.route('/')
def index():
    index_path = os.path.join(BASE_DIR, 'index.html')
    return send_file(index_path)

@app.route('/index.html')
def index_html():
    index_path = os.path.join(BASE_DIR, 'index.html')
    return send_file(index_path)

@app.route('/style.css')
def style_css():
    css_path = os.path.join(BASE_DIR, 'style.css')
    response = send_file(css_path, mimetype='text/css')
    if request.args.get('v') or request.args.get('t'):
        response.headers['Cache-Control'] = 'public, max-age=31536000'
    return response

@app.route('/app.js')
def app_js():
    js_path = os.path.join(BASE_DIR, 'app.js')
    response = send_file(js_path, mimetype='application/javascript')
    if request.args.get('v') or request.args.get('t'):
        response.headers['Cache-Control'] = 'public, max-age=31536000'
    return response

@app.route('/api/funds', methods=['GET'])
def get_funds():
    return jsonify(load_funds())

@app.route('/api/funds', methods=['POST'])
def add_fund():
    data = request.json
    code = data.get('code', '').strip()
    
    if not code or len(code) != 6 or not code.isdigit():
        return jsonify({'error': '请输入正确的6位基金代码'}), 400
    
    funds = load_funds()
    codes = get_fund_codes(funds)
    
    if code in codes:
        return jsonify({'error': '该基金已存在'}), 400
    
    funds.append({'code': code, 'shares': None})
    save_funds(funds)
    
    return jsonify({'success': True, 'code': code})

@app.route('/api/funds/<code>', methods=['DELETE'])
def remove_fund(code):
    funds = load_funds()
    index = find_fund_index(funds, code)
    
    if index >= 0:
        funds.pop(index)
        save_funds(funds)
        return jsonify({'success': True})
    
    return jsonify({'error': '基金不存在'}), 404

@app.route('/api/funds/<code>/shares', methods=['PUT'])
def update_fund_shares(code):
    data = request.json
    shares = data.get('shares')
    
    if shares is not None:
        try:
            shares = float(shares)
            if shares < 0:
                return jsonify({'error': '份额不能为负数'}), 400
        except (ValueError, TypeError):
            return jsonify({'error': '无效的份额数值'}), 400
    
    funds = load_funds()
    index = find_fund_index(funds, code)
    
    if index >= 0:
        funds[index]['shares'] = shares
        save_funds(funds)
        return jsonify({'success': True, 'code': code, 'shares': shares})
    
    return jsonify({'error': '基金不存在'}), 404

@app.route('/api/funds/order', methods=['PUT'])
def update_funds_order():
    data = request.json
    codes = data.get('funds', [])
    
    if not isinstance(codes, list):
        return jsonify({'error': '无效的数据格式'}), 400
    
    valid_codes = [c for c in codes if isinstance(c, str) and len(c) == 6 and c.isdigit()]
    
    if len(valid_codes) != len(codes):
        return jsonify({'error': '包含无效的基金代码'}), 400
    
    current_funds = load_funds()
    shares_map = {}
    for f in current_funds:
        if isinstance(f, dict):
            shares_map[f['code']] = f.get('shares')
    
    new_funds = []
    for code in valid_codes:
        new_funds.append({
            'code': code,
            'shares': shares_map.get(code)
        })
    
    save_funds(new_funds)
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
