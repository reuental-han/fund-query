from flask import Flask, jsonify, request
import requests
from flask_cors import CORS
import time
import os

app = Flask(__name__)
CORS(app)

FUND_API_BASE = "https://fund.eastmoney.com"

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
def get_fund_dividend(code):
    """获取基金分红信息"""
    try:
        url = f"{FUND_API_BASE}/f10/F10DataApi.aspx?type=FHFB&code={code}"
        response = safe_request(url, timeout=15)
        html = response.text

        # 解析 HTML 数据
        # 格式: <td>2024-01-15</td><td>0.123</td><td>现金分红</td><td>0.120</td>
        import re

        # 匹配分红日期
        date_pattern = r'<td>(\d{4}-\d{2}-\d{2})</td>'
        dates = re.findall(date_pattern, html)

        if dates:
            # 返回最近的分红日期
            return jsonify({
                'success': True,
                'dividendDate': dates[0]
            })
        else:
            return jsonify({
                'success': True,
                'dividendDate': None
            })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/fund/info/<code>')
def get_fund_info(code):
    """获取基金详细信息"""
    try:
        # 获取基金基本信息
        url = f"{FUND_API_BASE}/f10/F10DataApi.aspx?type=info&code={code}"
        response = safe_request(url, timeout=15)
        html = response.text

        # 解析 HTML
        import re

        # 尝试提取基金经理信息
        manager_pattern = r'基金经理.*?<td[^>]*>([^<]+)</td>'
        manager_match = re.search(manager_pattern, html, re.DOTALL)

        # 尝试提取基金规模
        scale_pattern = r'基金规模.*?<td[^>]*>([^<]+)</td>'
        scale_match = re.search(scale_pattern, html, re.DOTALL)

        # 尝试提取成立日期
        est_date_pattern = r'成立日期.*?<td[^>]*>([^<]+)</td>'
        est_date_match = re.search(est_date_pattern, html, re.DOTALL)

        # 尝试提取基金公司
        company_pattern = r'基金管理人.*?<td[^>]*>([^<]+)</td>'
        company_match = re.search(company_pattern, html, re.DOTALL)

        return jsonify({
            'success': True,
            'data': {
                'manager': manager_match.group(1).strip() if manager_match else '-',
                'scale': scale_match.group(1).strip() if scale_match else '-',
                'establishDate': est_date_match.group(1).strip() if est_date_match else '-',
                'company': company_match.group(1).strip() if company_match else '-'
            }
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/health')
def health_check():
    """健康检查"""
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
