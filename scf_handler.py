import json
import requests
import time
import re
from flask import Flask, request, jsonify

app = Flask(__name__)

def safe_request(url, timeout=10, max_retries=3):
    """安全的 HTTP 请求，带重试机制"""
    for attempt in range(max_retries):
        try:
            response = requests.get(url, timeout=timeout)
            response.raise_for_status()
            return response
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            raise e

@app.route('/api/fund/dividend/<code>')
def get_dividend(code):
    """获取基金分红信息"""
    try:
        url = f"https://fund.eastmoney.com/f10/F10DataApi.aspx?type=FHFB&code={code}"
        response = safe_request(url, timeout=15)
        html = response.text

        date_pattern = r'<td>(\d{4}-\d{2}-\d{2})</td>'
        dates = re.findall(date_pattern, html)

        if dates:
            return jsonify({'success': True, 'dividendDate': dates[0]})
        else:
            return jsonify({'success': True, 'dividendDate': None})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/health')
def health_check():
    """健康检查"""
    return jsonify({'status': 'ok'})

@app.route('/')
def index():
    return jsonify({'message': 'Fund Query API', 'endpoints': ['/api/fund/dividend/<code>', '/api/health']})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9000)
