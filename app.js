let currentFundCode = '';
let chart = null;
let draggedItem = null;

const STORAGE_KEY = 'fund_query_data';
const RECORD_KEY = 'fund_record_point';

function jsonpRequest(url, callbackName, timeout = 8000) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        let resolved = false;
        let timeoutId = null;

        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (script.parentNode) document.body.removeChild(script);
            setTimeout(() => {
                if (window[callbackName]) {
                    delete window[callbackName];
                }
            }, 100);
        };

        window[callbackName] = function(data) {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(data);
        };

        script.src = url;
        script.onerror = () => {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(new Error('网络请求失败'));
        };

        timeoutId = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error('请求超时'));
            }
        }, timeout);

        document.body.appendChild(script);
    });
}

function eastMoneyApiRequest(url, timeout = 10000) {
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
                resolve(content);
            }
        };

        script.onload = () => {
            checkData();
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error('获取数据失败'));
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
        }, timeout);

        script.src = url;
        document.body.appendChild(script);
    });
}

const fundInput = document.getElementById('fundInput');
const searchBtn = document.getElementById('searchBtn');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const result = document.getElementById('result');
const addFundInput = document.getElementById('addFundInput');
const addFundBtn = document.getElementById('addFundBtn');
const exportBtn = document.getElementById('exportBtn');
const setRecordBtn = document.getElementById('setRecordBtn');
const fundList = document.getElementById('fundList');
const fundListLoading = document.getElementById('fundListLoading');
const fundListHeader = document.getElementById('fundListHeader');
const refreshAllBtn = document.getElementById('refreshAllBtn');
const addFundStatus = document.getElementById('addFundStatus');
const exportModal = document.getElementById('exportModal');
const exportModalMessage = document.getElementById('exportModalMessage');
const exportModalInfo = document.getElementById('exportModalInfo');
const exportCancelBtn = document.getElementById('exportCancelBtn');
const exportConfirmBtn = document.getElementById('exportConfirmBtn');
const recordModal = document.getElementById('recordModal');
const recordCancelBtn = document.getElementById('recordCancelBtn');
const recordConfirmBtn = document.getElementById('recordConfirmBtn');
const recordPointDate = document.getElementById('recordPointDate');
const progressOverlay = document.getElementById('progressOverlay');
const progressTitle = document.getElementById('progressTitle');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');

let pendingExportBlob = null;
let pendingExportFilename = null;

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

function getRecordPoint() {
    try {
        const data = localStorage.getItem(RECORD_KEY);
        return data ? JSON.parse(data) : { date: null, values: {} };
    } catch (e) {
        console.error('读取记录点数据失败:', e);
        return { date: null, values: {} };
    }
}

function saveRecordPoint(values) {
    try {
        const record = {
            date: new Date().toISOString().split('T')[0],
            values: values
        };
        localStorage.setItem(RECORD_KEY, JSON.stringify(record));
        return true;
    } catch (e) {
        console.error('保存记录点数据失败:', e);
        return false;
    }
}

function updateRecordDateDisplay() {
    const record = getRecordPoint();
    if (record.date) {
        recordPointDate.textContent = record.date;
    } else {
        recordPointDate.textContent = '';
    }
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

setRecordBtn.addEventListener('click', () => {
    recordModal.classList.remove('hidden');
});

refreshAllBtn.addEventListener('click', () => loadSavedFunds());

exportConfirmBtn.addEventListener('click', () => confirmExport());
exportCancelBtn.addEventListener('click', () => closeExportModal());

recordConfirmBtn.addEventListener('click', () => confirmSetRecord());
recordCancelBtn.addEventListener('click', () => {
    recordModal.classList.add('hidden');
});

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

let progressTotal = 0;
let progressCompleted = 0;

function showProgress(total) {
    progressTotal = total;
    progressCompleted = 0;
    progressBar.style.width = '0%';
    progressText.textContent = `正在查询 0/${total} 支基金`;
    progressPercent.textContent = '0%';
    progressOverlay.classList.remove('hidden');
}

function updateProgress() {
    progressCompleted++;
    const percent = Math.round((progressCompleted / progressTotal) * 100);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `正在查询 ${progressCompleted}/${progressTotal} 支基金`;
    progressPercent.textContent = `${percent}%`;
}

function hideProgress() {
    progressOverlay.classList.add('hidden');
}

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
            updateRecordDateDisplay();
            return;
        }
        
        fundListHeader.classList.remove('hidden');
        updateRecordDateDisplay();
        
        showProgress(funds.length);
        
        const items = [];
        for (const fundData of funds) {
            const code = typeof fundData === 'string' ? fundData : fundData.code;
            const shares = typeof fundData === 'object' ? fundData.shares : null;
            const item = createFundItem(code, shares);
            fundList.appendChild(item);
            items.push({ code, item, shares });
        }
        
        for (const { code, item, shares } of items) {
            await fetchFundInfoForListWithProgress(code, item, shares);
        }
        
        hideProgress();
        refreshAllBtn.disabled = false;
        refreshAllBtn.textContent = '🔄 刷新';
        
    } catch (err) {
        hideProgress();
        fundListLoading.classList.add('hidden');
        fundList.innerHTML = '<div class="empty-tip">加载失败，请刷新重试</div>';
        refreshAllBtn.disabled = false;
        refreshAllBtn.textContent = '🔄 刷新';
    }
}

async function fetchFundInfoForListWithProgress(code, item, shares = null) {
    await fetchFundInfoForList(code, item, shares);
    updateProgress();
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
        <div class="fund-item-market-value">
            <div class="market-value-main">-</div>
            <div class="market-value-change"></div>
        </div>
        <div class="fund-item-record-value">-</div>
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
        const data = await fetchFundInfoForListJSONP(code);

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
        dividendEl.textContent = '查询中...';
        dividendEl.classList.add('querying');

        fetchDividendDateWithRetry(code).then(dividendDate => {
            dividendEl.classList.remove('querying');
            if (dividendDate) {
                dividendEl.textContent = dividendDate;
            } else {
                dividendEl.textContent = '暂无分红';
            }
        }).catch(err => {
            console.warn(`Failed to fetch dividend for ${code}:`, err);
            dividendEl.classList.remove('querying');
            dividendEl.textContent = '暂无分红';
        });
    } catch (err) {
        console.warn(`Failed to fetch fund info for ${code}:`, err);
        item.classList.remove('loading');
        item.querySelector('.fund-item-name').textContent = '获取失败';
        item.querySelector('.fund-item-name').style.color = '#e53e3e';
    }
}

const API_BASE = 'https://1342955257-84iuimb65s.ap-beijing.tencentscf.com';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function fetchDividendDateWithRetry(code, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(`${API_BASE}/api/fund/dividend/${code}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const result = await response.json();
            if (result.success && result.dividendDate) {
                return result.dividendDate;
            }
            return null;
        } catch (err) {
            console.warn(`Dividend fetch attempt ${attempt + 1} failed for ${code}:`, err);
            if (attempt < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
            }
        }
    }
    return null;
}

function fetchFundInfoForListJSONP(code) {
    return jsonpRequest(
        `https://fundgz.1234567.com.cn/js/${code}.js`,
        'jsonpgz',
        8000
    ).then(data => {
        if (data && data.fundcode) {
            return {
                code: data.fundcode,
                name: data.name,
                netValue: data.dwjz,
                netValueDate: data.jzrq,
                dayGrowth: data.gszzl
            };
        } else {
            throw new Error('API返回空数据');
        }
    });
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
    const marketValueMain = marketValueEl.querySelector('.market-value-main');
    const marketValueChange = marketValueEl.querySelector('.market-value-change');
    const recordValueEl = item.querySelector('.fund-item-record-value');
    const netValue = parseFloat(item.dataset.netValue);
    const code = item.dataset.code;
    
    const record = getRecordPoint();
    const recordValue = record.values[code] || null;
    
    if (recordValue) {
        recordValueEl.textContent = formatNumber(recordValue);
    } else {
        recordValueEl.textContent = '-';
    }
    
    if (shares && netValue) {
        const marketValue = shares * netValue;
        marketValueMain.textContent = formatNumber(marketValue);
        
        if (recordValue && recordValue > 0) {
            const diff = marketValue - recordValue;
            const percent = (diff / recordValue) * 100;
            
            if (diff !== 0) {
                const diffText = diff > 0 ? `+${formatNumber(diff)}` : formatNumber(diff);
                const percentText = percent > 0 ? `+${percent.toFixed(2)}%` : `${percent.toFixed(2)}%`;
                marketValueChange.textContent = `${diffText} (${percentText})`;
                marketValueChange.className = `market-value-change ${diff > 0 ? 'up' : 'down'}`;
            } else {
                marketValueChange.textContent = '0.00 (0.00%)';
                marketValueChange.className = 'market-value-change';
            }
        } else {
            marketValueChange.textContent = '';
        }
    } else {
        marketValueMain.textContent = '-';
        marketValueChange.textContent = '';
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
        const marketValueMain = item.querySelector('.market-value-main');
        const marketValueText = marketValueMain ? marketValueMain.textContent : '-';
        const marketValue = marketValueText && marketValueText !== '-' ? parseFloat(marketValueText.replace(/,/g, '')) : null;
        const recordValueEl = item.querySelector('.fund-item-record-value');
        const recordValueText = recordValueEl ? recordValueEl.textContent : '-';
        const recordValue = recordValueText && recordValueText !== '-' ? parseFloat(recordValueText.replace(/,/g, '')) : null;
        const dividendEl = item.querySelector('.fund-item-dividend');
        const dividendText = dividendEl ? dividendEl.textContent : '-';
        
        fundsData.push({
            name: name,
            code: code,
            netValueDate: netValueDate !== '-' ? netValueDate : null,
            netValue: netValue,
            shares: shares,
            marketValue: marketValue,
            recordValue: recordValue,
            dividendDate: dividendText !== '-' && dividendText !== '暂无分红' ? dividendText : null
        });
    });
    
    exportBtn.disabled = true;
    exportBtn.textContent = '准备中...';
    showAddFundStatus('info', '正在生成Excel文件，请稍候...');
    
    try {
        const worksheetData = [
            ['基金名称', '基金代码', '净值日期', '单位净值', '基金份额', '基金市值', '记录点市值', '最近分红']
        ];
        
        fundsData.forEach(fund => {
            worksheetData.push([
                fund.name || '',
                fund.code || '',
                fund.netValueDate || '',
                fund.netValue || '',
                fund.shares || '',
                fund.marketValue || '',
                fund.recordValue || '',
                fund.dividendDate || ''
            ]);
        });
        
        const csvContent = worksheetData.map(row => 
            row.map(cell => {
                if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))) {
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(',')
        ).join('\n');
        
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
        
        const today = new Date().toISOString().split('T')[0];
        const filename = `基金列表_${today}.csv`;
        
        pendingExportBlob = blob;
        pendingExportFilename = filename;
        
        exportModalInfo.textContent = `共 ${fundsData.length} 支基金，文件大小：${(blob.size / 1024).toFixed(1)} KB`;
        exportModal.classList.remove('hidden');
        
        hideAddFundStatus();
        
    } catch (err) {
        console.warn('Error exporting funds:', err);
        showAddFundStatus('error', '导出失败，请重试');
    }
    
    exportBtn.disabled = false;
    exportBtn.textContent = '导出';
}

function confirmExport() {
    if (!pendingExportBlob || !pendingExportFilename) return;
    
    if (window.showSaveFilePicker) {
        window.showSaveFilePicker({
            suggestedName: pendingExportFilename,
            types: [{
                description: 'CSV文件',
                accept: { 'text/csv': ['.csv'] }
            }]
        }).then(handle => {
            return handle.createWritable();
        }).then(writable => {
            return writable.write(pendingExportBlob).then(() => writable.close());
        }).then(() => {
            closeExportModal();
            showAddFundStatus('success', '✅ 文件已保存');
        }).catch(err => {
            if (err.name !== 'AbortError') {
                console.error('保存文件失败:', err);
                fallbackDownload();
            }
        }).finally(() => {
            pendingExportBlob = null;
            pendingExportFilename = null;
        });
    } else {
        fallbackDownload();
    }
    
    function fallbackDownload() {
        const url = window.URL.createObjectURL(pendingExportBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pendingExportFilename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        closeExportModal();
        pendingExportBlob = null;
        pendingExportFilename = null;
    }
}

function closeExportModal() {
    exportModal.classList.add('hidden');
    pendingExportBlob = null;
    pendingExportFilename = null;
}

function confirmSetRecord() {
    const items = fundList.querySelectorAll('.fund-item');
    const recordValues = {};
    
    items.forEach(item => {
        const code = item.dataset.code;
        const netValue = parseFloat(item.dataset.netValue);
        const sharesText = item.querySelector('.shares-display').textContent;
        const shares = sharesText && sharesText !== '-' ? parseFloat(sharesText.replace(/,/g, '')) : null;
        
        if (shares && netValue) {
            recordValues[code] = shares * netValue;
        }
    });
    
    saveRecordPoint(recordValues);
    recordModal.classList.add('hidden');
    
    updateRecordDateDisplay();
    
    items.forEach(item => {
        const code = item.dataset.code;
        const sharesText = item.querySelector('.shares-display').textContent;
        const shares = sharesText && sharesText !== '-' ? parseFloat(sharesText.replace(/,/g, '')) : null;
        updateMarketValue(item, shares);
    });
    
    showAddFundStatus('success', `✅ 记录点已设置（共 ${Object.keys(recordValues).length} 支基金）`);
}

function hideAddFundStatus() {
    addFundStatus.classList.add('hidden');
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
            const data = await fetchFundInfoForListJSONP(code);
            
            if (data.name || data.netValue) {
                validCodes.push(code);
                existingCodes.add(code);
            } else {
                notFoundCodes.push(code);
            }
        } catch (err) {
            notFoundCodes.push(code);
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
    
    const item = fundList.querySelector(`.fund-item[data-code="${code}"]`);
    if (item) {
        item.classList.add('fund-item-removing');
        setTimeout(() => {
            item.remove();
            if (fundList.querySelectorAll('.fund-item').length === 0) {
                fundList.innerHTML = '<div class="empty-tip">暂无保存的基金，请添加基金代码</div>';
                fundListHeader.classList.add('hidden');
            }
        }, 300);
    }
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
    return jsonpRequest(
        `https://fundgz.1234567.com.cn/js/${code}.js`,
        'jsonpgz',
        3000
    ).then(data => {
        if (data && data.fundcode) {
            return {
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
            };
        } else {
            throw new Error('fundgz API返回空数据');
        }
    });
}

function fetchFundInfoFromHistory(code) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const formatDate = (date) => {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    const url = `https://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=${code}&page=1&sdate=${formatDate(startDate)}&edate=${formatDate(endDate)}&per=10`;

    return eastMoneyApiRequest(url, 5000).then(content => {
        const data = parseNetValueData(content);
        if (data.length > 0) {
            const latest = data[data.length - 1];
            const prev = data.length > 1 ? data[data.length - 2] : null;

            let dayGrowth = '-';
            if (prev && prev.value > 0) {
                dayGrowth = ((latest.value - prev.value) / prev.value * 100).toFixed(2);
            }

            return fetchFundName(code).then(name => ({
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
            })).catch(() => ({
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
            }));
        } else {
            throw new Error('未找到该基金，请检查基金代码');
        }
    });
}

async function fetchFundName(code) {
    try {
        const data = await fetchFundInfoForListJSONP(code);
        return data.name || null;
    } catch (err) {
        console.warn(`Failed to fetch fund name for ${code}:`, err);
        return null;
    }
}

async function fetchDividendDate(code) {
    return null;
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
    const url = `https://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=${code}&page=1&sdate=${sdate}&edate=${edate}&per=365`;

    return eastMoneyApiRequest(url, 10000).then(content => {
        const data = parseNetValueData(content);
        if (data.length > 0) {
            return data;
        } else {
            throw new Error('获取历史数据失败');
        }
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
