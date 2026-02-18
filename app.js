let currentFundCode = '';
let chart = null;
let draggedItem = null;

const STORAGE_KEY = 'fund_query_data';

const fundInput = document.getElementById('fundInput');
const searchBtn = document.getElementById('searchBtn');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const result = document.getElementById('result');
const addFundInput = document.getElementById('addFundInput');
const addFundBtn = document.getElementById('addFundBtn');
const exportBtn = document.getElementById('exportBtn');
const fundList = document.getElementById('fundList');
const fundListLoading = document.getElementById('fundListLoading');
const fundListHeader = document.getElementById('fundListHeader');
const refreshAllBtn = document.getElementById('refreshAllBtn');
const addFundStatus = document.getElementById('addFundStatus');

function getStoredFunds() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('读取本地存储失败:', e);
        return [];
    }
}

function saveStoredFunds(funds) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(funds));
        return true;
    } catch (e) {
        console.error('保存到本地存储失败:', e);
        return false;
    }
}

function findFundIndex(funds, code) {
    return funds.findIndex(f => {
        const fundCode = typeof f === 'string' ? f : f.code;
        return fundCode === code;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadSavedFunds();
});

searchBtn.addEventListener('click', () => searchFund());
fundInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchFund();
});

addFundBtn.addEventListener('click', () => addFund());
addFundInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addFund();
});

exportBtn.addEventListener('click', () => exportFunds());

refreshAllBtn.addEventListener('click', () => loadSavedFunds());

document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        fundInput.value = btn.dataset.code;
        searchFund();
    });
});

document.querySelectorAll('.chart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (currentFundCode) {
            loadChart(currentFundCode, btn.dataset.range);
        }
    });
});

const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:5000' : '';

async function loadSavedFunds() {
    fundList.innerHTML = '';
    fundListLoading.classList.remove('hidden');
    fundListHeader.classList.add('hidden');
    refreshAllBtn.disabled = true;
    refreshAllBtn.textContent = '刷新中...';
    
    try {
        const funds = getStoredFunds();
        
        fundListLoading.classList.add('hidden');
        
        if (funds.length === 0) {
            fundList.innerHTML = '<div class="empty-tip">暂无保存的基金，请添加基金代码</div>';
            refreshAllBtn.disabled = false;
            refreshAllBtn.textContent = '🔄 刷新';
            return;
        }
        
        fundListHeader.classList.remove('hidden');
        
        const items = [];
        for (const fundData of funds) {
            const code = typeof fundData === 'string' ? fundData : fundData.code;
            const shares = typeof fundData === 'object' ? fundData.shares : null;
            const item = createFundItem(code, shares);
            fundList.appendChild(item);
            items.push({ code, item, shares });
        }
        
        const promises = items.map(({ code, item, shares }) => 
            fetchFundInfoForList(code, item, shares)
        );
        await Promise.all(promises);
        
        refreshAllBtn.disabled = false;
        refreshAllBtn.textContent = '🔄 刷新';
        
    } catch (err) {
        fundListLoading.classList.add('hidden');
        fundList.innerHTML = '<div class="empty-tip">加载失败，请刷新重试</div>';
        refreshAllBtn.disabled = false;
        refreshAllBtn.textContent = '🔄 刷新';
    }
}

function createFundItem(code, shares = null) {
    const item = document.createElement('div');
    item.className = 'fund-item loading';
    item.dataset.code = code;
    item.draggable = true;
    item.innerHTML = `
        <div class="fund-item-name">加载中...</div>
        <div class="fund-item-code">${code}</div>
        <div class="fund-item-date">-</div>
        <div class="fund-item-value">-</div>
        <div class="fund-item-shares">
            <span class="shares-display">${shares ? formatNumber(shares) : '-'}</span>
            <input type="number" class="shares-input hidden" step="0.01" min="0" placeholder="份额" value="${shares || ''}">
        </div>
        <div class="fund-item-market-value">-</div>
        <div class="fund-item-dividend">-</div>
        <div class="fund-item-actions">
            <button class="fund-item-edit" title="编辑份额">编辑</button>
            <button class="fund-item-delete" title="删除">×</button>
        </div>
    `;
    
    item.querySelector('.fund-item-name').addEventListener('click', () => {
        fundInput.value = code;
        searchFund();
    });
    
    const editBtn = item.querySelector('.fund-item-edit');
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEditMode(item, code);
    });
    
    item.querySelector('.fund-item-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFund(code);
    });
    
    const sharesInput = item.querySelector('.shares-input');
    sharesInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveShares(item, code);
        }
    });
    
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('dragenter', handleDragEnter);
    item.addEventListener('dragleave', handleDragLeave);
    item.addEventListener('drop', handleDrop);
    
    return item;
}

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.code);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.fund-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    draggedItem = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    if (this !== draggedItem) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    
    if (draggedItem && this !== draggedItem) {
        const allItems = [...fundList.querySelectorAll('.fund-item')];
        const draggedIndex = allItems.indexOf(draggedItem);
        const targetIndex = allItems.indexOf(this);
        
        if (draggedIndex < targetIndex) {
            this.parentNode.insertBefore(draggedItem, this.nextSibling);
        } else {
            this.parentNode.insertBefore(draggedItem, this);
        }
        
        saveFundsOrder();
    }
}

async function saveFundsOrder() {
    const items = fundList.querySelectorAll('.fund-item');
    const codes = [...items].map(item => item.dataset.code);
    
    const funds = getStoredFunds();
    const sharesMap = {};
    for (const f of funds) {
        if (typeof f === 'object') {
            sharesMap[f.code] = f.shares;
        }
    }
    
    const newFunds = codes.map(code => ({
        code: code,
        shares: sharesMap[code] || null
    }));
    
    saveStoredFunds(newFunds);
}

async function fetchFundInfoForList(code, item, shares = null) {
    try {
        const response = await fetch(`${API_BASE}/api/fundinfo/${code}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        item.classList.remove('loading');
        item.dataset.netValue = data.netValue || '';
        
        if (data.name) {
            item.querySelector('.fund-item-name').textContent = data.name;
        } else {
            item.querySelector('.fund-item-name').textContent = `基金${code}`;
        }
        
        item.querySelector('.fund-item-date').textContent = data.netValueDate || '-';
        
        const valueEl = item.querySelector('.fund-item-value');
        valueEl.textContent = data.netValue || '-';
        
        const growth = parseFloat(data.dayGrowth);
        if (!isNaN(growth)) {
            if (growth >= 0) {
                valueEl.classList.add('up');
            } else {
                valueEl.classList.add('down');
            }
        }
        
        updateMarketValue(item, shares);
        
        const dividendEl = item.querySelector('.fund-item-dividend');
        if (data.dividendDate) {
            dividendEl.textContent = data.dividendDate;
            dividendEl.classList.add('has-dividend');
            if (isWithinDays(data.dividendDate, 45)) {
                dividendEl.classList.add('recent-dividend');
            }
        } else {
            dividendEl.textContent = '暂无分红';
        }
    } catch (err) {
        console.warn(`Failed to fetch fund info for ${code}:`, err);
        item.classList.remove('loading');
        item.querySelector('.fund-item-name').textContent = '获取失败';
        item.querySelector('.fund-item-name').style.color = '#e53e3e';
    }
}

function formatNumber(num) {
    if (num === null || num === undefined) return '-';
    const n = parseFloat(num);
    if (isNaN(n)) return '-';
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isWithinDays(dateStr, days) {
    if (!dateStr) return false;
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = today.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays >= 0 && diffDays <= days;
}

function updateMarketValue(item, shares) {
    const marketValueEl = item.querySelector('.fund-item-market-value');
    const netValue = parseFloat(item.dataset.netValue);
    
    if (shares && netValue) {
        const marketValue = shares * netValue;
        marketValueEl.textContent = formatNumber(marketValue);
    } else {
        marketValueEl.textContent = '-';
    }
}

function toggleEditMode(item, code) {
    const editBtn = item.querySelector('.fund-item-edit');
    const sharesDisplay = item.querySelector('.shares-display');
    const sharesInput = item.querySelector('.shares-input');
    
    if (editBtn.textContent === '编辑') {
        sharesDisplay.classList.add('hidden');
        sharesInput.classList.remove('hidden');
        sharesInput.focus();
        editBtn.textContent = '保存';
        editBtn.classList.add('saving');
    } else {
        saveShares(item, code);
    }
}

async function saveShares(item, code) {
    const editBtn = item.querySelector('.fund-item-edit');
    const sharesDisplay = item.querySelector('.shares-display');
    const sharesInput = item.querySelector('.shares-input');
    
    const sharesValue = sharesInput.value.trim();
    const shares = sharesValue ? parseFloat(sharesValue) : null;
    
    if (sharesValue && isNaN(shares)) {
        alert('请输入有效的份额数值');
        return;
    }
    
    editBtn.disabled = true;
    editBtn.textContent = '保存中...';
    
    try {
        const funds = getStoredFunds();
        const index = findFundIndex(funds, code);
        
        if (index >= 0) {
            funds[index] = { code: code, shares: shares };
            saveStoredFunds(funds);
        }
        
        sharesDisplay.textContent = shares ? formatNumber(shares) : '-';
        sharesDisplay.classList.remove('hidden');
        sharesInput.classList.add('hidden');
        editBtn.textContent = '编辑';
        editBtn.classList.remove('saving');
        
        updateMarketValue(item, shares);
    } catch (err) {
        console.warn('Error saving shares:', err);
        alert('保存失败，请重试');
        editBtn.textContent = '保存';
    }
    
    editBtn.disabled = false;
}

async function exportFunds() {
    const items = fundList.querySelectorAll('.fund-item');
    
    if (items.length === 0) {
        showAddFundStatus('error', '没有基金数据可导出');
        return;
    }
    
    const fundsData = [];
    
    items.forEach(item => {
        const name = item.querySelector('.fund-item-name').textContent;
        const code = item.dataset.code;
        const netValueDate = item.querySelector('.fund-item-date').textContent;
        const netValue = item.dataset.netValue || null;
        const sharesDisplay = item.querySelector('.shares-display');
        const sharesText = sharesDisplay.textContent;
        const shares = sharesText && sharesText !== '-' ? parseFloat(sharesText.replace(/,/g, '')) : null;
        const marketValueText = item.querySelector('.fund-item-market-value').textContent;
        const marketValue = marketValueText && marketValueText !== '-' ? parseFloat(marketValueText.replace(/,/g, '')) : null;
        const dividendText = item.querySelector('.fund-item-dividend').textContent;
        const dividendDate = dividendText !== '暂无分红' ? dividendText : null;
        
        fundsData.push({
            name: name,
            code: code,
            netValueDate: netValueDate !== '-' ? netValueDate : null,
            netValue: netValue,
            shares: shares,
            marketValue: marketValue,
            dividendDate: dividendDate
        });
    });
    
    exportBtn.disabled = true;
    exportBtn.textContent = '准备中...';
    showAddFundStatus('info', '正在生成Excel文件，请稍候...');
    
    try {
        const response = await fetch(`${API_BASE}/api/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ funds: fundsData })
        });
        
        if (!response.ok) {
            throw new Error('导出失败');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = '基金列表.xlsx';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/i);
            if (filenameMatch && filenameMatch[1]) {
                filename = decodeURIComponent(filenameMatch[1]);
            }
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showAddFundStatus('success', `✅ 导出成功！文件已下载（共 ${fundsData.length} 支基金）`);
        
    } catch (err) {
        console.warn('Error exporting funds:', err);
        showAddFundStatus('error', '导出失败，请重试');
    }
    
    exportBtn.disabled = false;
    exportBtn.textContent = '导出';
}

async function addFund() {
    const input = addFundInput.value.trim();
    
    if (!input) {
        showAddFundStatus('error', '请输入基金代码');
        return;
    }
    
    const normalizedInput = input.replace(/，/g, ',');
    const codeList = normalizedInput.split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);
    
    const invalidCodes = codeList.filter(c => !/^\d{6}$/.test(c));
    if (invalidCodes.length > 0) {
        showAddFundStatus('error', `以下代码格式无效（需为6位数字）：${invalidCodes.join(', ')}`);
        return;
    }
    
    if (codeList.length > 50) {
        showAddFundStatus('error', `单次最多添加50支基金，当前输入了${codeList.length}支`);
        return;
    }
    
    addFundBtn.disabled = true;
    addFundBtn.textContent = `验证中 (0/${codeList.length})...`;
    hideAddFundStatus();
    
    const funds = getStoredFunds();
    const existingCodes = new Set(funds.map(f => typeof f === 'string' ? f : f.code));
    
    const validCodes = [];
    const duplicateCodes = [];
    const notFoundCodes = [];
    const errorCodes = [];
    
    for (let i = 0; i < codeList.length; i++) {
        const code = codeList[i];
        addFundBtn.textContent = `验证中 (${i + 1}/${codeList.length})...`;
        
        if (existingCodes.has(code)) {
            duplicateCodes.push(code);
            continue;
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/fundinfo/${code}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            
            if (!response.ok) {
                notFoundCodes.push(code);
                continue;
            }
            
            const data = await response.json();
            
            if (data.name || data.netValue) {
                validCodes.push(code);
                existingCodes.add(code);
            } else {
                notFoundCodes.push(code);
            }
        } catch (err) {
            errorCodes.push(code);
        }
    }
    
    if (validCodes.length > 0) {
        const newFunds = validCodes.map(code => ({ code: code, shares: null }));
        saveStoredFunds([...funds, ...newFunds]);
    }
    
    addFundBtn.disabled = false;
    addFundBtn.textContent = '添加';
    
    let statusType = 'success';
    let statusMessages = [];
    
    if (validCodes.length > 0) {
        statusMessages.push(`✅ 成功添加 ${validCodes.length} 支基金`);
    }
    
    if (duplicateCodes.length > 0) {
        statusType = validCodes.length > 0 ? 'warning' : 'error';
        statusMessages.push(`⚠️ ${duplicateCodes.length} 支已存在：${duplicateCodes.join(', ')}`);
    }
    
    if (notFoundCodes.length > 0) {
        statusType = validCodes.length > 0 ? 'warning' : 'error';
        statusMessages.push(`❌ ${notFoundCodes.length} 支不存在：${notFoundCodes.join(', ')}`);
    }
    
    if (errorCodes.length > 0) {
        statusType = validCodes.length > 0 ? 'warning' : 'error';
        statusMessages.push(`⚠️ ${errorCodes.length} 支验证失败：${errorCodes.join(', ')}`);
    }
    
    showAddFundStatus(statusType, statusMessages.join('<br>'));
    
    if (validCodes.length > 0) {
        addFundInput.value = '';
        appendNewFunds(validCodes);
    }
}

function appendNewFunds(codes) {
    if (codes.length === 0) return;
    
    fundListHeader.classList.remove('hidden');
    
    const items = [];
    for (const code of codes) {
        const item = createFundItem(code, null);
        item.classList.add('fund-item-new');
        fundList.appendChild(item);
        items.push({ code, item, shares: null });
    }
    
    setTimeout(() => {
        document.querySelectorAll('.fund-item-new').forEach(item => {
            item.classList.remove('fund-item-new');
        });
    }, 50);
    
    const promises = items.map(({ code, item, shares }) => 
        fetchFundInfoForList(code, item, shares)
    );
    Promise.all(promises);
}

function showAddFundStatus(type, message) {
    addFundStatus.className = `add-fund-status ${type}`;
    addFundStatus.innerHTML = message;
    addFundStatus.classList.remove('hidden');
}

function hideAddFundStatus() {
    addFundStatus.classList.add('hidden');
}

function showAddFundError(message) {
    showAddFundStatus('error', message);
}

function showAddFundSuccess(message) {
    showAddFundStatus('success', message);
}

async function removeFund(code) {
    const funds = getStoredFunds();
    const index = findFundIndex(funds, code);
    
    if (index >= 0) {
        funds.splice(index, 1);
        saveStoredFunds(funds);
    }
    
    loadSavedFunds();
}

function showAddFundError(message) {
    const existing = document.querySelector('.add-fund-error');
    if (existing) existing.remove();
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error add-fund-error';
    errorDiv.style.margin = '0 0 15px 0';
    errorDiv.style.padding = '10px 15px';
    errorDiv.textContent = message;
    
    addFundInput.parentNode.parentNode.insertBefore(errorDiv, fundList);
    
    setTimeout(() => errorDiv.remove(), 3000);
}

function showAddFundSuccess(message) {
    const existing = document.querySelector('.add-fund-success');
    if (existing) existing.remove();
    
    const successDiv = document.createElement('div');
    successDiv.className = 'success add-fund-success';
    successDiv.textContent = message;
    
    addFundInput.parentNode.parentNode.insertBefore(successDiv, fundList);
    
    setTimeout(() => successDiv.remove(), 2000);
}

async function searchFund() {
    const code = fundInput.value.trim();
    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
        showError('请输入正确的6位基金代码');
        return;
    }

    showLoading();
    currentFundCode = code;

    try {
        let fundData = null;
        
        try {
            fundData = await fetchFundInfo(code);
        } catch (err) {
            fundData = await fetchFundInfoFromHistory(code);
        }
        
        displayFundInfo(fundData);
        await loadChart(code, '1m');
        showResult();
    } catch (err) {
        showError(err.message);
    }
}

function fetchFundInfo(code) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        let resolved = false;
        let timeoutId = null;
        
        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            delete window.jsonpgz;
            if (script.parentNode) document.body.removeChild(script);
        };
        
        window.jsonpgz = function(data) {
            if (resolved) return;
            resolved = true;
            cleanup();
            
            if (data && data.fundcode) {
                resolve({
                    code: data.fundcode,
                    name: data.name,
                    type: '-',
                    netValue: data.dwjz,
                    netValueDate: data.jzrq,
                    dayGrowth: data.gszzl,
                    estimatedValue: data.gsz,
                    estimatedTime: data.gztime,
                    weekGrowth: '-',
                    monthGrowth: '-',
                    threeMonthGrowth: '-',
                    sixMonthGrowth: '-',
                    yearGrowth: '-',
                    manager: '-',
                    company: '-',
                    scale: '-',
                    establishDate: '-'
                });
            } else {
                reject(new Error('fundgz API返回空数据'));
            }
        };

        script.src = `https://fundgz.1234567.com.cn/js/${code}.js`;
        script.onerror = () => {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(new Error('fundgz API请求失败'));
        };
        
        timeoutId = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error('fundgz API请求超时'));
            }
        }, 3000);
        
        document.body.appendChild(script);
    });
}

function fetchFundInfoFromHistory(code) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        let resolved = false;
        let timeoutId = null;
        
        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (script.parentNode) document.body.removeChild(script);
        };
        
        const checkData = () => {
            if (resolved) return;
            
            if (window.apidata && window.apidata.content) {
                resolved = true;
                const content = window.apidata.content;
                delete window.apidata;
                cleanup();
                
                const data = parseNetValueData(content);
                if (data.length > 0) {
                    const latest = data[data.length - 1];
                    const prev = data.length > 1 ? data[data.length - 2] : null;
                    
                    let dayGrowth = '-';
                    if (prev && prev.value > 0) {
                        dayGrowth = ((latest.value - prev.value) / prev.value * 100).toFixed(2);
                    }
                    
                    fetchFundName(code).then(name => {
                        resolve({
                            code: code,
                            name: name || `基金${code}`,
                            type: '-',
                            netValue: latest.value.toString(),
                            netValueDate: latest.date,
                            dayGrowth: dayGrowth,
                            weekGrowth: '-',
                            monthGrowth: '-',
                            threeMonthGrowth: '-',
                            sixMonthGrowth: '-',
                            yearGrowth: '-',
                            manager: '-',
                            company: '-',
                            scale: '-',
                            establishDate: '-'
                        });
                    }).catch(() => {
                        resolve({
                            code: code,
                            name: `基金${code}`,
                            type: '-',
                            netValue: latest.value.toString(),
                            netValueDate: latest.date,
                            dayGrowth: dayGrowth,
                            weekGrowth: '-',
                            monthGrowth: '-',
                            threeMonthGrowth: '-',
                            sixMonthGrowth: '-',
                            yearGrowth: '-',
                            manager: '-',
                            company: '-',
                            scale: '-',
                            establishDate: '-'
                        });
                    });
                } else {
                    reject(new Error('未找到该基金，请检查基金代码'));
                }
            }
        };
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        
        const formatDate = (date) => {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };
        
        script.onload = () => {
            checkData();
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error('未找到该基金，请检查基金代码'));
            }
        };
        
        script.onerror = () => {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(new Error('网络请求失败，请稍后重试'));
        };
        
        timeoutId = setTimeout(() => {
            if (!resolved) {
                checkData();
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(new Error('请求超时，请稍后重试'));
                }
            }
        }, 5000);
        
        script.src = `https://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=${code}&page=1&sdate=${formatDate(startDate)}&edate=${formatDate(endDate)}&per=10`;
        document.body.appendChild(script);
    });
}

async function fetchFundName(code) {
    try {
        const response = await fetch(`${API_BASE}/api/fundname/${code}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            console.warn(`Fund name API returned ${response.status} for fund ${code}`);
            return null;
        }
        
        const data = await response.json();
        
        if (data && data.name) {
            return data.name;
        }
        
        return null;
    } catch (err) {
        console.warn(`Failed to fetch fund name for ${code}:`, err);
        return null;
    }
}

async function fetchDividendDate(code) {
    try {
        const response = await fetch(`${API_BASE}/api/dividend/${code}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            console.warn(`Dividend API returned ${response.status} for fund ${code}`);
            return null;
        }
        
        const data = await response.json();
        
        if (data && data.dividendDate) {
            return data.dividendDate;
        }
        
        return null;
    } catch (err) {
        console.warn(`Failed to fetch dividend date for ${code}:`, err);
        return null;
    }
}

function displayFundInfo(data) {
    document.getElementById('fundName').textContent = data.name;
    document.getElementById('fundCode').textContent = data.code;
    document.getElementById('fundType').textContent = data.type || '-';
    
    document.getElementById('netValue').textContent = data.netValue || '-';
    document.getElementById('netValueDate').textContent = `(${data.netValueDate || '-'})`;
    
    setGrowthValue('dayGrowth', data.dayGrowth);
    setGrowthValue('weekGrowth', data.weekGrowth);
    setGrowthValue('monthGrowth', data.monthGrowth);
    setGrowthValue('threeMonthGrowth', data.threeMonthGrowth);
    setGrowthValue('yearGrowth', data.yearGrowth);
    
    document.getElementById('manager').textContent = data.manager;
    document.getElementById('company').textContent = data.company;
    document.getElementById('scale').textContent = data.scale ? data.scale + '亿元' : '-';
    document.getElementById('establishDate').textContent = data.establishDate;
}

function setGrowthValue(elementId, value) {
    const element = document.getElementById(elementId);
    const numValue = parseFloat(value);
    
    if (isNaN(numValue)) {
        element.textContent = value || '-';
        element.className = 'stat-value';
        return;
    }
    
    const prefix = numValue > 0 ? '+' : '';
    element.textContent = prefix + numValue.toFixed(2) + '%';
    element.className = 'stat-value ' + (numValue >= 0 ? 'up' : 'down');
}

async function loadChart(code, range) {
    const chartDom = document.getElementById('chart');
    
    if (!chart) {
        chart = echarts.init(chartDom);
    }

    chart.showLoading();

    try {
        const data = await fetchNetValueHistory(code, range);
        renderChart(data);
    } catch (err) {
        console.error('加载图表失败:', err);
        chart.hideLoading();
    }
}

function fetchNetValueHistory(code, range) {
    return new Promise((resolve, reject) => {
        const endDate = new Date();
        const startDate = new Date();
        
        switch (range) {
            case '1m':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case '3m':
                startDate.setMonth(startDate.getMonth() - 3);
                break;
            case '6m':
                startDate.setMonth(startDate.getMonth() - 6);
                break;
            case '1y':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                startDate.setMonth(startDate.getMonth() - 1);
        }
        
        const formatDate = (date) => {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };
        
        const sdate = formatDate(startDate);
        const edate = formatDate(endDate);
        const script = document.createElement('script');
        let resolved = false;
        let timeoutId = null;
        
        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (script.parentNode) document.body.removeChild(script);
        };
        
        const checkData = () => {
            if (resolved) return;
            
            if (window.apidata && window.apidata.content) {
                resolved = true;
                const content = window.apidata.content;
                delete window.apidata;
                cleanup();
                
                const data = parseNetValueData(content);
                if (data.length > 0) {
                    resolve(data);
                } else {
                    reject(new Error('获取历史数据失败'));
                }
            }
        };
        
        script.onload = () => {
            checkData();
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error('获取历史数据失败'));
            }
        };
        
        script.onerror = () => {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(new Error('网络请求失败'));
        };
        
        timeoutId = setTimeout(() => {
            if (!resolved) {
                checkData();
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(new Error('请求超时'));
                }
            }
        }, 10000);
        
        script.src = `https://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=${code}&page=1&sdate=${sdate}&edate=${edate}&per=365`;
        document.body.appendChild(script);
    });
}

function parseNetValueData(html) {
    const data = [];
    const regex = /<td>(\d{4}-\d{2}-\d{2})<\/td>\s*<td[^>]*>([\d.]+)<\/td>/g;
    let match;
    
    while ((match = regex.exec(html)) !== null) {
        data.push({
            date: match[1],
            value: parseFloat(match[2])
        });
    }
    
    return data.reverse();
}

function renderChart(data) {
    if (!chart) return;
    
    chart.hideLoading();

    const dates = data.map(item => item.date);
    const values = data.map(item => item.value);

    const option = {
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(50, 50, 50, 0.9)',
            borderColor: '#333',
            textStyle: { color: '#fff' },
            formatter: function(params) {
                return `${params[0].axisValue}<br/>净值: ${params[0].value}`;
            }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            top: '10%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: dates,
            boundaryGap: false,
            axisLine: { lineStyle: { color: '#ddd' } },
            axisLabel: { 
                color: '#888',
                formatter: function(value) {
                    return value.substring(5);
                }
            }
        },
        yAxis: {
            type: 'value',
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { lineStyle: { color: '#f0f0f0' } },
            axisLabel: { color: '#888' }
        },
        series: [{
            type: 'line',
            data: values,
            smooth: true,
            symbol: 'none',
            lineStyle: {
                width: 3,
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: '#667eea' },
                    { offset: 1, color: '#764ba2' }
                ])
            },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(102, 126, 234, 0.3)' },
                    { offset: 1, color: 'rgba(102, 126, 234, 0.05)' }
                ])
            }
        }]
    };

    chart.setOption(option);
}

function showLoading() {
    loading.classList.remove('hidden');
    error.classList.add('hidden');
    result.classList.add('hidden');
}

function showError(message) {
    loading.classList.add('hidden');
    error.textContent = message;
    error.classList.remove('hidden');
    result.classList.add('hidden');
}

function showResult() {
    loading.classList.add('hidden');
    error.classList.add('hidden');
    result.classList.remove('hidden');
}

window.addEventListener('resize', () => {
    if (chart) {
        chart.resize();
    }
});
