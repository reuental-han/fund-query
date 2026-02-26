import json
import requests
import time
import re

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

def get_dividend(code):
    """获取基金分红信息"""
    try:
        url = f"https://fund.eastmoney.com/f10/F10DataApi.aspx?type=FHFB&code={code}"
        response = safe_request(url, timeout=15)
        html = response.text

        date_pattern = r'<td>(\d{4}-\d{2}-\d{2})</td>'
        dates = re.findall(date_pattern, html)

        if dates:
            return {'success': True, 'dividendDate': dates[0]}
        else:
            return {'success': True, 'dividendDate': None}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def main_handler(event, context):
    """腾讯云 SCF 入口函数"""
    # 解析请求路径
    path = event.get('path', '')
    method = event.get('httpMethod', 'GET')
    
    # 解析路径参数
    path_parts = path.strip('/').split('/')
    
    # 设置 CORS 头
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }
    
    # 处理 OPTIONS 预检请求
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    # 路由处理
    try:
        # 健康检查
        if path.endswith('/api/health'):
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'status': 'ok'})
            }
        
        # 分红查询: /api/fund/dividend/{code}
        if '/api/fund/dividend/' in path:
            code = path_parts[-1]
            if code.isdigit() and len(code) == 6:
                result = get_dividend(code)
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps(result)
                }
        
        # 404
        return {
            'statusCode': 404,
            'headers': headers,
            'body': json.dumps({'error': 'Not Found'})
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e)})
        }

# 本地测试入口
if __name__ == '__main__':
    # 模拟 SCF 事件
    test_event = {
        'path': '/api/fund/dividend/000001',
        'httpMethod': 'GET'
    }
    result = main_handler(test_event, None)
    print(result)
