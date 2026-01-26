/**
 * DOMINIUM - Main UI Controller (v2)
 * ===================================
 * Orquestra a interface com filtros de casos de carga
 */
import { LoadProcessor } from '../core/loads.js';
import { SectionMaterials } from '../core/materials.js';
import { BendingVerifier } from '../core/bending.js';
import { ShearVerifier } from '../core/shear.js';
import { FatigueVerifier } from '../core/fatigue.js';
import { ServiceabilityVerifier } from '../core/serviceability.js';
import { DomainVisualizer } from '../components/DomainVisualizer.js';

// Instancias globais
let loadProcessor = null;
let momentChart = null;
let shearChart = null;
let deflectionChart = null;
let currentLoadCase = 'ENV_MOVEL';
let currentChartTarget = 'shear';
let detailSections = [];
let selectedDetailSectionId = null;
let domainVisualizer = null;

// Funções auxiliares para Detalhamento
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const formatNumber = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '0.0';

function findClosestIndex(stations = [], target) {
    if (!stations.length || !Number.isFinite(target)) return 0;
    let bestIdx = 0;
    let bestDelta = Infinity;
    stations.forEach((value, index) => {
        const delta = Math.abs(value - target);
        if (delta < bestDelta) {
            bestDelta = delta;
            bestIdx = index;
        }
    });
    return bestIdx;
}

function getCaseAtX(data, x) {
    if (!data || !Array.isArray(data.stations) || !data.stations.length) {
        return null;
    }
    const idx = findClosestIndex(data.stations, x);
    return {
        M_max: data.M_max?.[idx] ?? 0,
        M_min: data.M_min?.[idx] ?? 0,
        V_max: data.V_max?.[idx] ?? 0,
        V_min: data.V_min?.[idx] ?? 0
    };
}

function computeEffectiveDepth(inputs) {
    const barDia = inputs.barPhi / 10;
    const stirrDia = inputs.stirrPhi / 10;
    return inputs.h - inputs.cover - stirrDia - barDia / 2;
}

function computeAsProvided(inputs) {
    const barDia = inputs.barPhi / 10;
    return inputs.nBars * Math.PI * (barDia / 2) ** 2;
}

function computeAsCompressed(inputs) {
    const barDia = inputs.barPhiComp / 10;
    return inputs.nBarsComp * Math.PI * (barDia / 2) ** 2;
}

function computeStirrupAsw(inputs) {
    const stirrDia = inputs.stirrPhi / 10;
    const area = Math.PI * (stirrDia / 2) ** 2;
    const legs = 2;
    const spacing = inputs.stirrSpacing > 0 ? inputs.stirrSpacing : 1;
    return (legs * area / spacing) * 100;
}

function computeCiv(span) {
    if (!Number.isFinite(span) || span <= 0) return 1.0;
    if (span < 10) return 1.35;
    if (span <= 200) return 1 + 1.06 * (20 / (span + 50));
    return 1.0;
}

function computeCompressionCover(inputs) {
    const stirrDia = inputs.stirrPhi / 10;
    const barPhi = inputs.nBarsComp > 0 ? inputs.barPhiComp : inputs.barPhi;
    const barDia = barPhi / 10;
    return inputs.cover + stirrDia + barDia / 2;
}

function syncImpactInputs() {
    const spanEl = document.getElementById('inp-span');
    const civEl = document.getElementById('inp-civ');
    if (!spanEl || !civEl) return;
    const span = parseFloat(spanEl.value);
    const civ = computeCiv(span);
    civEl.value = Number.isFinite(civ) ? civ.toFixed(3) : '1.000';
}

function setupImpactInputs() {
    const spanEl = document.getElementById('inp-span');
    if (!spanEl) return;
    spanEl.addEventListener('input', syncImpactInputs);
    spanEl.addEventListener('change', syncImpactInputs);
}

function syncWkLimitFromCaa() {
    const caaEl = document.getElementById('inp-caa');
    const wkEl = document.getElementById('inp-wk-lim');
    if (!caaEl || !wkEl) return;
    const option = caaEl.options[caaEl.selectedIndex];
    const wk = parseFloat(option?.dataset?.wk || '');
    if (Number.isFinite(wk)) {
        wkEl.value = wk.toFixed(2);
    }
}

function setupServiceInputs() {
    const caaEl = document.getElementById('inp-caa');
    if (!caaEl) return;
    caaEl.addEventListener('change', syncWkLimitFromCaa);
    caaEl.addEventListener('input', syncWkLimitFromCaa);
    syncWkLimitFromCaa();
}

function buildUtilRow(label, util, ok) {
    const safeUtil = Number.isFinite(util) ? util : 0;
    const clamped = clamp(safeUtil, 0, 100);
    const barClass = ok ? 'bg-emerald-500' : 'bg-rose-500';
    const badgeClass = ok ? 'bg-emerald-500' : 'bg-rose-500';
    const badgeLabel = ok ? 'OK' : 'ALERTA';

    return `
        <div class="grid grid-cols-[1fr_auto] gap-2 items-center">
            <div>
                <div class="flex items-center justify-between text-xs text-gray-600">
                    <span>${label}</span>
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${badgeClass} text-white">${badgeLabel}</span>
                </div>
                <div class="h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
                    <div class="h-2 ${barClass} progress-bar" style="width: ${clamped}%"></div>
                </div>
            </div>
            <div class="text-xs text-gray-500 w-10 text-right">${Math.round(safeUtil)}%</div>
        </div>
    `;
}

function normalizeKey(key) {
    return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getColumnMap(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return {};
    }
    const keys = Object.keys(rows[0]);
    const map = {};
    for (const key of keys) {
        const norm = normalizeKey(key);
        if (norm === 'frame') map.frame = key;
        if (norm === 'station') map.station = key;
        if (norm === 'outputcase') map.outputcase = key;
        if (norm === 'v2') map.v2 = key;
        if (norm === 'm3') map.m3 = key;
    }
    return map;
}

function mapCaseName(raw) {
    const name = String(raw || '').trim().toUpperCase();
    if (!name) return null;
    if (name.includes('DEAD')) return 'DEAD';
    if (name.includes('TRILHO')) return 'TRILHO';
    if (name.includes('ENV')) return 'ENV_MOVEL';
    return null;
}

function parseExcelRows(rows) {
    const cols = getColumnMap(rows);
    if (!cols.frame || !cols.station || !cols.outputcase || !cols.v2 || !cols.m3) {
        throw new Error('Excel columns not found.');
    }
    const items = [];
    for (const row of rows) {
        const xRaw = parseFloat(row[cols.station]);
        if (!Number.isFinite(xRaw)) continue;
        const x = Math.round(xRaw * 10) / 10;
        const frame = String(row[cols.frame] || '').trim();
        if (!frame) continue;
        const caseId = mapCaseName(row[cols.outputcase]);
        if (!caseId) continue;
        const vVal = parseFloat(row[cols.v2]);
        const mVal = parseFloat(row[cols.m3]);
        const v = Number.isFinite(vVal) ? vVal : null;
        const m = Number.isFinite(mVal) ? mVal : null;
        if (v === null && m === null) continue;
        items.push({ frame, x, caseId, v, m });
    }
    return items;
}

function buildLoadData(items) {
    const frameExtents = new Map();
    const updateExtent = (frame, x) => {
        const current = frameExtents.get(frame);
        if (!current) {
            frameExtents.set(frame, { min: x, max: x });
            return;
        }
        current.min = Math.min(current.min, x);
        current.max = Math.max(current.max, x);
    };
    for (const item of items) {
        updateExtent(item.frame, item.x);
    }
    const frameOrder = Array.from(frameExtents.keys()).sort((a, b) => parseFloat(a) - parseFloat(b));

    const buildSimpleCase = (caseId) => {
        const frameMap = new Map();
        for (const item of items) {
            if (item.caseId !== caseId) continue;
            if (!frameMap.has(item.frame)) frameMap.set(item.frame, []);
            frameMap.get(item.frame).push({ x: item.x, V: item.v || 0, M: item.m || 0 });
        }
        const combined = [];
        for (const frame of frameOrder) {
            const list = frameMap.get(frame) || [];
            list.sort((a, b) => a.x - b.x);
            combined.push(...list);
        }
        return combined;
    };

    const buildEnvMovel = () => {
        const groupMap = new Map();
        for (const item of items) {
            if (item.caseId !== 'ENV_MOVEL') continue;
            const key = `${item.frame}|${item.x}`;
            if (!groupMap.has(key)) {
                groupMap.set(key, { frame: item.frame, x: item.x, vVals: [], mVals: [] });
            }
            const group = groupMap.get(key);
            if (item.v !== null) group.vVals.push(item.v);
            if (item.m !== null) group.mVals.push(item.m);
        }
        const frameMap = new Map();
        for (const group of groupMap.values()) {
            const vMax = group.vVals.length ? Math.max(...group.vVals) : 0;
            const vMin = group.vVals.length ? Math.min(...group.vVals) : 0;
            const mMax = group.mVals.length ? Math.max(...group.mVals) : 0;
            const mMin = group.mVals.length ? Math.min(...group.mVals) : 0;
            if (!frameMap.has(group.frame)) frameMap.set(group.frame, []);
            frameMap.get(group.frame).push({ x: group.x, V_max: vMax, V_min: vMin, M_max: mMax, M_min: mMin });
        }
        const combined = [];
        for (const frame of frameOrder) {
            const list = frameMap.get(frame) || [];
            list.sort((a, b) => a.x - b.x);
            combined.push(...list);
        }
        return combined;
    };

    const dead = buildSimpleCase('DEAD');
    const trilho = buildSimpleCase('TRILHO');
    const envMovel = buildEnvMovel();

    const frames = frameOrder.map((frame) => {
        const ext = frameExtents.get(frame);
        const length = ext ? Math.max(0, ext.max - ext.min) : 0;
        return { name: frame, length: length, startX: ext.min, endX: ext.max };
    });

    let totalLength = 0;
    for (const ext of frameExtents.values()) {
        totalLength = Math.max(totalLength, ext.max);
    }

    return { dead, trilho, envMovel, frames, totalLength };
}

async function readExcelFile(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('No sheets found.');
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

function setupExcelUpload() {
    const input = document.getElementById('input-excel');
    const button = document.getElementById('btn-load-excel');
    const status = document.getElementById('excel-status');
    if (!input || !button || !status) return;

    const setStatus = (text, isError = false) => {
        status.textContent = text;
        status.className = isError ? 'text-xs text-red-600 mt-2' : 'text-xs text-gray-500 mt-2';
    };

    if (!window.XLSX) {
        setStatus('XLSX library not loaded.', true);
        button.disabled = true;
        return;
    }

    input.addEventListener('change', () => {
        if (input.files && input.files[0]) {
            setStatus(`Arquivo selecionado: ${input.files[0].name}`);
        } else {
            setStatus('Sem arquivo carregado.');
        }
    });

    button.addEventListener('click', async () => {
        if (!input.files || !input.files[0]) {
            setStatus('Selecione um arquivo .xlsx.', true);
            return;
        }
        try {
            setStatus('Lendo Excel...');
            const rows = await readExcelFile(input.files[0]);
            const items = parseExcelRows(rows);
            const loadData = buildLoadData(items);
            if (!loadData.dead.length || !loadData.trilho.length || !loadData.envMovel.length) {
                throw new Error('Load cases not found in Excel.');
            }
            if (!loadProcessor) {
                loadProcessor = new LoadProcessor();
            }
            loadProcessor.setCaseData(loadData);
            const spanEl = document.getElementById('inp-span');
            if (spanEl && Number.isFinite(loadData.totalLength)) {
                spanEl.value = loadData.totalLength.toFixed(2);
                syncImpactInputs();
            }
            runCalculation();
            setStatus(`Excel carregado: ${input.files[0].name}`);
        } catch (err) {
            console.error(err);
            setStatus('Erro ao ler Excel.', true);
        }
    });
}



function initCharts() {
    const ctxMoments = document.getElementById('chart-moments').getContext('2d');
    const ctxShear = document.getElementById('chart-shear').getContext('2d');

    // Grafico de Momentos
    momentChart = new Chart(ctxMoments, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'M_max',
                    data: [],
                    borderColor: '#2196f3',
                    backgroundColor: 'rgba(33, 150, 243, 0.15)',
                    fill: '+1',
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#2196f3'
                },
                {
                    label: 'M_min',
                    data: [],
                    borderColor: '#f44336',
                    backgroundColor: 'rgba(244, 67, 54, 0.15)',
                    fill: 'origin',
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#f44336'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    reverse: true,
                    title: { display: true, text: 'Momento (kN.m)' },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                },
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Posição (m)' },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { filter: (legendItem, data) => { const dataset = data.datasets[legendItem.datasetIndex]; return dataset && dataset.label; } } },
                tooltip: {
                    callbacks: {
                        label: ctx => `x=${ctx.parsed.x.toFixed(1)} m, ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} kN.m`
                    }
                }
            }
        }
    });

    // Grafico de Cortantes - LINHA COM FORMATO CORRETO
    shearChart = new Chart(ctxShear, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'V_max',
                    data: [],
                    borderColor: '#4caf50',
                    backgroundColor: 'rgba(76, 175, 80, 0.15)',
                    fill: '+1',
                    tension: 0,
                    pointRadius: 4,
                    pointBackgroundColor: '#4caf50',
                    stepped: false
                },
                {
                    label: 'V_min',
                    data: [],
                    borderColor: '#ff9800',
                    backgroundColor: 'rgba(255, 152, 0, 0.15)',
                    fill: 'origin',
                    tension: 0,
                    pointRadius: 4,
                    pointBackgroundColor: '#ff9800',
                    stepped: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    title: { display: true, text: 'Cortante (kN)' },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                },
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Posição (m)' },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { filter: (legendItem, data) => { const dataset = data.datasets[legendItem.datasetIndex]; return dataset && dataset.label; } } },
                tooltip: {
                    callbacks: {
                        label: ctx => `x=${ctx.parsed.x.toFixed(1)} m, ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} kN`
                    }
                }
            }
        }
    });
}

// Configura as abas dos gráficos
function setupChartTabs() {
    updateChartToggleButtons(currentLoadCase);
}

/**
 * Atualiza os botões de toggle dos gráficos baseado no caso de carga
 * @param {string} loadCase - ID do caso de carga atual
 */
function updateChartToggleButtons(loadCase) {
    const container = document.querySelector('.chart-toggle')?.parentElement;
    if (!container) return;

    // Gerar botões dinamicamente
    let buttonsHtml = `
        <button class="px-3 py-1 text-xs font-medium rounded-md bg-white shadow-sm text-gray-800 transition-all chart-toggle active" data-target="shear">Cortantes</button>
        <button class="px-3 py-1 text-xs font-medium rounded-md text-gray-600 hover:bg-white hover:shadow-sm transition-all chart-toggle" data-target="moment">Momentos</button>
        <button class="px-3 py-1 text-xs font-medium rounded-md text-gray-600 hover:bg-white hover:shadow-sm transition-all chart-toggle" data-target="deflection">Flecha</button>
    `;

    container.innerHTML = buttonsHtml;

    // Re-adicionar event listeners
    const chartToggles = container.querySelectorAll('.chart-toggle');
    const chartContainers = {
        'shear': document.getElementById('container-shear'),
        'moment': document.getElementById('container-moment'),
        'deflection': document.getElementById('container-deflection')
    };
    const chartTitle = document.getElementById('current-chart-title');
    const deflectionInfo = document.getElementById('deflection-els-info');

    chartToggles.forEach(toggle => {
        // Marcar botão ativo correto
        if (toggle.dataset.target === currentChartTarget) {
            toggle.classList.add('active', 'bg-white', 'shadow-sm', 'text-gray-800');
            toggle.classList.remove('text-gray-600', 'hover:bg-white', 'hover:shadow-sm');
        }

        toggle.addEventListener('click', () => {
            // Atualizar botoes ativos
            chartToggles.forEach(t => {
                t.classList.remove('active', 'bg-white', 'shadow-sm', 'text-gray-800');
                t.classList.add('text-gray-600', 'hover:bg-white', 'hover:shadow-sm');
            });
            toggle.classList.add('active', 'bg-white', 'shadow-sm', 'text-gray-800');
            toggle.classList.remove('text-gray-600', 'hover:bg-white', 'hover:shadow-sm');

            // Mostrar container alvo
            const target = toggle.dataset.target;

            Object.values(chartContainers).forEach(c => {
                if (c) {
                    c.classList.add('opacity-0', 'pointer-events-none');
                    c.classList.remove('z-10');
                    c.classList.add('z-0');
                }
            });

            if (chartContainers[target]) {
                chartContainers[target].classList.remove('opacity-0', 'pointer-events-none', 'z-0');
                chartContainers[target].classList.add('z-10');
            }

            // Atualizar titulos
            if (chartTitle) {
                if (target === 'shear') chartTitle.innerText = 'Cortantes (kN)';
                else if (target === 'moment') chartTitle.innerText = 'Momentos (kN.m)';
                else if (target === 'deflection') chartTitle.innerText = 'Linha Elástica (cm)';
            }
            currentChartTarget = target;
            updateChartFormula();
            if (target === 'deflection') {
                updateDeflectionChart();
                updateDeflectionElsInfo();
            } else {
                hideDeflectionElsInfo();
            }
        });
    });
}

/**
 * Exibe informações de verificação ELS-DEF abaixo do gráfico de flecha
 */
function updateDeflectionElsInfo() {
    let infoDiv = document.getElementById('deflection-els-info');
    const chartContainer = document.getElementById('container-deflection')?.parentElement;

    if (!chartContainer) return;

    if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'deflection-els-info';
        infoDiv.className = 'mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200';
        chartContainer.parentElement.appendChild(infoDiv);
    }

    if (!loadProcessor) {
        infoDiv.innerHTML = '<p class="text-gray-500 text-sm">Clique em CALCULAR para ver a verificacao de flecha.</p>';
        infoDiv.classList.remove('hidden');
        return;
    }

    const deflectionResult = getDeflectionResultForCase(currentLoadCase);
    const frames = loadProcessor.frames || [];
    const totalLength = loadProcessor.totalLength || 0;
    const isElsQp = currentLoadCase === 'ELS_QP';

    if (!frames.length) {
        infoDiv.innerHTML = '<p class="text-gray-500 text-sm">Dados de vaos nao disponiveis.</p>';
        infoDiv.classList.remove('hidden');
        return;
    }

    if (!deflectionResult || !Array.isArray(deflectionResult.deflections) || !deflectionResult.deflections.length) {
        infoDiv.innerHTML = '<p class="text-gray-500 text-sm">Sem dados de flecha para este caso.</p>';
        infoDiv.classList.remove('hidden');
        return;
    }

    const spans = Array.isArray(frames) && frames.length
        ? frames.map((frame) => {
            const startX = Number.isFinite(frame.startX) ? frame.startX : 0;
            const endX = Number.isFinite(frame.endX)
                ? frame.endX
                : (Number.isFinite(frame.length) ? startX + frame.length : totalLength || 0);
            return { startX, endX };
        })
        : [{ startX: 0, endX: totalLength || 0 }];

    // Calcular flecha por vao
    let html = `
        <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Verificacao ELS-DEF (Flecha)
        </h4>
        ${isElsQp ? '' : '<div class="text-xs text-gray-500 mb-3">Verificacao L/250 aplicada somente para ELS-QP.</div>'}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    `;

    let allOk = true;
    spans.forEach((span, idx) => {
        const L = span.endX - span.startX;
        if (L <= 0) {
            return;
        }
        const limitCm = (L * 100) / 250; // L/250 em cm
        const spanDeflections = deflectionResult.deflections.filter((pt) =>
            pt.x >= span.startX - 1e-6 && pt.x <= span.endX + 1e-6
        );
        let maxDeflection = 0;
        for (const pt of spanDeflections) {
            const value = Number.isFinite(pt.f) ? Math.abs(pt.f) : 0;
            if (value > maxDeflection) {
                maxDeflection = value;
            }
        }

        const utilization = isElsQp && limitCm > 0 ? (maxDeflection / limitCm) * 100 : 0;
        const isOk = isElsQp ? maxDeflection <= limitCm : true;
        if (isElsQp && !isOk) allOk = false;

        const bgColor = isElsQp
            ? (isOk ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200')
            : 'bg-slate-50 border-slate-200';
        const textColor = isElsQp
            ? (isOk ? 'text-emerald-700' : 'text-amber-700')
            : 'text-slate-700';
        const badge = isElsQp
            ? (isOk
                ? '<span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500 text-white">OK</span>'
                : '<span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500 text-white">ALERTA</span>')
            : '';

        html += `
            <div class="p-3 rounded-lg border ${bgColor}">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium text-gray-600">Vao ${idx + 1}</span>
                    ${badge}
                </div>
                <div class="text-xs text-gray-500">L = ${L.toFixed(2)} m</div>
                <div class="mt-2 flex justify-between items-center">
                    <span class="text-xs text-gray-500">delta_max</span>
                    <span class="text-sm font-semibold ${textColor}">${maxDeflection.toFixed(2)} cm</span>
                </div>
                ${isElsQp ? `
                <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-500">delta_lim (L/250)</span>
                    <span class="text-sm text-gray-600">${limitCm.toFixed(2)} cm</span>
                </div>
                <div class="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div class="h-full ${isOk ? 'bg-emerald-500' : 'bg-amber-500'}" style="width: ${Math.min(utilization, 100)}%"></div>
                </div>
                <div class="text-right text-[10px] text-gray-500 mt-1">${utilization.toFixed(0)}%</div>
                ` : ''}
            </div>
        `;
    });

    html += '</div>';

    if (isElsQp) {
        const summaryBg = allOk ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
        html += `
            <div class="mt-3 p-2 rounded ${summaryBg} text-sm font-medium text-center">
                ${allOk ? 'Todos os vaos atendem ao limite L/250' : 'Alguns vaos ultrapassam o limite L/250'}
            </div>
        `;
    }

    infoDiv.innerHTML = html;
    infoDiv.classList.remove('hidden');
}

function hideDeflectionElsInfo() {
    const infoDiv = document.getElementById('deflection-els-info');
    if (infoDiv) {
        infoDiv.classList.add('hidden');
    }
}

// Grafico de Flecha
function initDeflectionChart() {
    const ctx = document.getElementById('chart-deflection')?.getContext('2d');
    if (!ctx || deflectionChart) {
        return;
    }
    deflectionChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Flecha', data: [], borderColor: '#9c27b0', backgroundColor: 'rgba(156, 39, 176, 0.1)', fill: true, tension: 0.4, pointRadius: 2 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { reverse: false, title: { display: true, text: 'Flecha (cm)' } }, x: { type: 'linear', title: { display: true, text: 'Posicao (m)' } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `f=${ctx.parsed.y.toFixed(2)} cm` } } }
        }
    });
}

function getDeflectionResultForCase(loadCaseId) {
    if (!loadProcessor) return null;
    const data = loadProcessor.getLoadCaseData(loadCaseId);
    const dataToUse = (data && data.stations) ? data : loadProcessor.getLoadCaseData('DEAD');
    if (!dataToUse || !dataToUse.stations) return null;

    const inputs = getDetailInputs();
    const bw = inputs.bw;
    const h = inputs.h;
    const fck = getNumericValue('inp-fck', 30);
    const fyk = inputs.fykLong;
    const d = computeEffectiveDepth(inputs);
    const As = computeAsProvided(inputs);
    const phi = inputs.barPhi;
    const dLinha = inputs.cover + (inputs.stirrPhi / 10) + (phi / 10) / 2;

    const elsVerifier = new ServiceabilityVerifier(
        { bw, h, d },
        { fck, fyk },
        As,
        { phi, d_linha: dLinha, As_linha: inputs.asComp }
    );

    const moments = buildMomentSeries(dataToUse);
    if (!moments.length) return null;

    return buildDeflectionBySpans(
        elsVerifier,
        moments,
        loadProcessor.frames,
        loadProcessor.totalLength
    );
}

function updateDeflectionChart() {
    if (!loadProcessor) return;
    if (!deflectionChart) {
        initDeflectionChart();
    }
    if (!deflectionChart) return;
    try {
        const result = getDeflectionResultForCase(currentLoadCase);
        if (!result || !Array.isArray(result.deflections)) return;

        deflectionChart.data.labels = result.deflections.map(pt => pt.x);
        deflectionChart.data.datasets[0].data = result.deflections.map(pt => ({ x: pt.x, y: pt.f }));
        deflectionChart.update();

    } catch (e) {
        console.warn('Erro Deflection:', e);
    }
}

function toPoints(stations, values) {
    const points = [];
    const safeStations = Array.isArray(stations) ? stations : [];
    const safeValues = Array.isArray(values) ? values : [];
    const count = Math.min(safeStations.length, safeValues.length);
    for (let i = 0; i < count; i++) {
        points.push({ x: safeStations[i], y: safeValues[i] });
    }
    return points;
}

function pickEnvelopeValue(maxVal, minVal) {
    const maxSafe = Number.isFinite(maxVal) ? maxVal : 0;
    const minSafe = Number.isFinite(minVal) ? minVal : 0;
    return Math.abs(maxSafe) >= Math.abs(minSafe) ? maxSafe : minSafe;
}

function getMomentAtIndex(data, idx) {
    if (!data || idx === null || idx === undefined) {
        return null;
    }
    if (Array.isArray(data.M_max) && Array.isArray(data.M_min)) {
        return pickEnvelopeValue(data.M_max[idx], data.M_min[idx]);
    }
    if (Array.isArray(data.M_values)) {
        const value = data.M_values[idx];
        return Number.isFinite(value) ? value : 0;
    }
    return null;
}

function buildMomentSeries(data) {
    if (!data || !Array.isArray(data.stations)) {
        return [];
    }
    if (Array.isArray(data.M_max) && Array.isArray(data.M_min)) {
        return data.stations.map((x, i) => ({
            x,
            M: pickEnvelopeValue(data.M_max[i], data.M_min[i])
        }));
    }
    if (Array.isArray(data.M_values)) {
        return data.stations.map((x, i) => ({
            x,
            M: Number.isFinite(data.M_values[i]) ? data.M_values[i] : 0
        }));
    }
    return [];
}

function buildDeflectionBySpans(elsVerifier, moments, frames, totalLength) {
    const spans = Array.isArray(frames) && frames.length
        ? frames.map((frame) => {
            const startX = Number.isFinite(frame.startX) ? frame.startX : 0;
            const endX = Number.isFinite(frame.endX)
                ? frame.endX
                : (Number.isFinite(frame.length) ? startX + frame.length : totalLength || 0);
            return { startX, endX };
        })
        : [{ startX: 0, endX: totalLength || 0 }];

    const alpha_f = elsVerifier.calcCreepFactor();
    const factor = 1 + alpha_f;

    const deflections = [];
    let worstUtil = 0;
    let worstTotal = 0;
    let worstLimit = 0;

    for (const span of spans) {
        const spanLength = span.endX - span.startX;
        if (spanLength <= 0) {
            continue;
        }
        const spanMoments = moments
            .filter((pt) => pt.x >= span.startX - 1e-6 && pt.x <= span.endX + 1e-6)
            .map((pt) => ({ x: pt.x - span.startX, M: pt.M }));

        if (spanMoments.length < 2) {
            continue;
        }

        const immediate = elsVerifier.calcDeflection(spanMoments, spanLength);
        const spanDeflections = immediate.deflections.map((pt) => ({
            x: pt.x + span.startX,
            f: pt.f * factor
        }));
        deflections.push(...spanDeflections);

        const f_total = Math.abs(immediate.maxDeflection) * factor;
        const f_lim = (spanLength * 100) / 250;
        const util = f_lim > 0 ? (f_total / f_lim) * 100 : 0;

        if (util > worstUtil) {
            worstUtil = util;
            worstTotal = f_total;
            worstLimit = f_lim;
        }
    }

    deflections.sort((a, b) => a.x - b.x);

    return {
        deflections,
        f_total: worstTotal,
        f_lim: worstLimit,
        utilizacao: worstUtil,
        status: worstUtil <= 100 ? 'OK' : 'FAIL'
    };
}

function safeUtilization(value) {
    return Number.isFinite(value) ? value : 0;
}

function getCombinationFormula(loadCase) {
    switch (loadCase) {
        case 'ELU':
            return 'ELU = 1.4*(G + T) + 1.4*(Q*CIV*CIA*CNF)';
        case 'FADIGA':
            return 'Fadiga = 1.0*(G + T) + 1.0*(Q*CIV*CIA*CNF)';
        case 'ELS_QP':
            return 'ELS-QP = 1.0*(G + T) + 0.5*(Q*CIV*CIA*CNF)';
        case 'ELS_FREQ':
            return 'ELS-FREQ = 1.0*(G + T) + 0.8*(Q*CIV*CIA*CNF)';
        default:
            return '';
    }
}

function updateChartFormula() {
    const subtitle = document.getElementById('chart-subtitle');
    if (!subtitle) return;
    subtitle.textContent = getCombinationFormula(currentLoadCase);
}

/**
 * Atualiza os graficos para um caso de carga
 */
function updateCharts(loadCase) {
    const data = loadProcessor.getLoadCaseData(loadCase);
    const stations = Array.isArray(data.stations) ? data.stations : [];

    const isEnvelope = data.M_max && data.M_max.length > 0;

    // Momentos
    momentChart.data.labels = [];
    if (isEnvelope) {
        momentChart.data.datasets[0].data = toPoints(stations, data.M_max);
        momentChart.data.datasets[1].data = toPoints(stations, data.M_min);
        momentChart.data.datasets[0].label = 'M_max';
        momentChart.data.datasets[1].label = 'M_min';
        momentChart.data.datasets[1].hidden = false;
    } else {
        momentChart.data.datasets[0].data = toPoints(stations, data.M_values);
        momentChart.data.datasets[0].label = 'Momento';
        momentChart.data.datasets[1].data = [];
        momentChart.data.datasets[1].hidden = true;
    }
    momentChart.update();

    // Cortantes
    shearChart.data.labels = [];
    if (isEnvelope) {
        shearChart.data.datasets[0].data = toPoints(stations, data.V_max);
        shearChart.data.datasets[1].data = toPoints(stations, data.V_min);
        shearChart.data.datasets[0].label = 'V_max';
        shearChart.data.datasets[1].label = 'V_min';
        shearChart.data.datasets[1].hidden = false;
    } else {
        shearChart.data.datasets[0].data = toPoints(stations, data.V_values);
        shearChart.data.datasets[0].label = 'Cortante';
        shearChart.data.datasets[1].data = [];
        shearChart.data.datasets[1].hidden = true;
    }
    shearChart.update();
}

/**
 * Renderiza os botÃµes de filtro de casos de carga
 */
function renderLoadCaseFilters() {
    const container = document.getElementById('load-case-filters');
    const loadCases = loadProcessor.getAvailableLoadCases();

    let html = '';
    for (const lc of loadCases) {
        const isActive = lc.id === currentLoadCase;
        const activeClass = isActive ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200';
        html += `
            <button data-loadcase="${lc.id}" 
                    class="load-case-btn px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeClass}"
                    style="${isActive ? '' : `border-left: 3px solid ${lc.color}`}">
                ${lc.label}
            </button>
        `;
    }
    container.innerHTML = html;

    // Event listeners
    container.querySelectorAll('.load-case-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentLoadCase = e.target.dataset.loadcase;
            renderLoadCaseFilters();
            updateChartToggleButtons(currentLoadCase); // Atualiza botões de gráfico (mostra/oculta Flecha)
            updateCharts(currentLoadCase);
            updateChartFormula();
            updateCriticalSections();
            updateDeflectionChart(); // Atualiza flecha sempre que trocar caso
            if (currentChartTarget === 'deflection') {
                updateDeflectionElsInfo();
            }
        });
    });
}

/**
 * Cria um card de seÃ§Ã£o crÃ­tica
 */
function createSectionCard(section, results) {
    const allOk = results.every(r => r.status === 'OK');
    const borderColor = allOk ? 'border-green-400' : 'border-red-400';
    const bgColor = allOk ? 'bg-green-50' : 'bg-red-50';

    let itemsHtml = '';
    for (const result of results) {
        const statusColor = result.status === 'OK' ? 'bg-green-500' : 'bg-red-500';
        const barWidth = Math.min(result.utilizacao, 100);
        const barColor = result.utilizacao <= 100 ? 'bg-green-400' : 'bg-red-400';

        itemsHtml += `
            <div class="py-2 border-b last:border-b-0">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm text-gray-700">${result.name}</span>
                    <span class="text-xs px-2 py-0.5 rounded ${statusColor} text-white">${result.status}</span>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full ${barColor} transition-all" style="width: ${barWidth}%"></div>
                    </div>
                    <span class="text-xs text-gray-500 w-12 text-right">${result.utilizacao.toFixed(0)}%</span>
                </div>
            </div>
        `;
    }

    return `
        <div class="border-2 ${borderColor} ${bgColor} rounded-lg p-4">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h4 class="font-semibold text-gray-800">${section.name}</h4>
                    <p class="text-xs text-gray-500">x = ${section.x.toFixed(1)} m</p>
                </div>
                <span class="text-lg">${allOk ? 'OK' : 'X'}</span>
            </div>
            <div class="space-y-1">
                ${itemsHtml}
            </div>
            <div class="mt-3 pt-2 border-t text-xs text-gray-600">
                M = ${section.M_max.toFixed(1)} / ${section.M_min.toFixed(1)} kN.m<br>
                V = ${section.V_max.toFixed(1)} / ${section.V_min.toFixed(1)} kN
            </div>
        </div>
    `;
}

/**
 * Atualiza as seÃ§Ãµes crÃ­ticas
 */
function updateCriticalSections(sections = null) {
    const container = document.getElementById('critical-sections');
    if (!container || !loadProcessor) return;

    const items = sections || loadProcessor.findCriticalSections();
    if (!items.length) {
        container.innerHTML = `
            <div class="text-gray-400 text-center py-8 col-span-full">
                Clique em "CALCULAR" para gerar a analise
            </div>
        `;
        return;
    }

    const inputs = getDetailInputs();
    const fck = getNumericValue('inp-fck', 30);
    const d = computeEffectiveDepth(inputs);
    const AsProv = computeAsProvided(inputs);
    const AsComp = inputs.asComp;
    const stirrDia = inputs.stirrPhi / 10;
    const Asw_s = computeStirrupAsw(inputs);
    const fatigueData = loadProcessor.getLoadCaseData('FADIGA');

    container.innerHTML = items.map((section) => {
        const momentCandidateMax = section.M_max || 0;
        const momentCandidateMin = section.M_min || 0;
        const moment = Math.abs(momentCandidateMax) >= Math.abs(momentCandidateMin)
            ? momentCandidateMax
            : momentCandidateMin;
        const momentAbs = Math.abs(moment);
        const momentPositive = moment >= 0;

        let AsTension = momentPositive ? AsProv : AsComp;
        let AsCompression = momentPositive ? AsComp : AsProv;
        let barDiaTension = momentPositive ? inputs.barPhi : inputs.barPhiComp;
        let barDiaCompression = momentPositive ? inputs.barPhiComp : inputs.barPhi;
        if (!(AsTension > 0)) {
            AsTension = AsProv;
            AsCompression = 0;
            barDiaTension = inputs.barPhi;
            barDiaCompression = inputs.barPhiComp;
        }

        const dFlex = inputs.h - inputs.cover - stirrDia - (barDiaTension / 10) / 2;
        const dLinhaFlex = inputs.cover + stirrDia + (barDiaCompression / 10) / 2;
        const bendingVerifier = new BendingVerifier(
            { bw: inputs.bw, h: inputs.h, d: dFlex, c_nom: inputs.cover },
            { fck: fck, fyk: inputs.fykLong }
        );
        let flexUsesCompression = AsCompression > 0 && AsTension > 0;
        let flexResult = null;
        if (!(AsTension > 0)) {
            flexUsesCompression = false;
            flexResult = { status: 'ERROR', utilizacao: 0, xi: 0 };
        } else if (flexUsesCompression) {
            flexResult = bendingVerifier.verifySectionWithCompression(momentAbs, AsTension, AsCompression, dFlex, dLinhaFlex);
            if (flexResult.status === 'ERROR') {
                flexUsesCompression = false;
                flexResult = bendingVerifier.verifySection(momentAbs, AsTension);
            }
        } else {
            flexResult = bendingVerifier.verifySection(momentAbs, AsTension);
        }
        const flexUtil = flexResult.utilizacao || 0;
        const flexOk = flexResult.status === 'OK';

        const Vsd = Math.max(Math.abs(section.V_max || 0), Math.abs(section.V_min || 0));
        const shearVerifier = new ShearVerifier(
            { bw: inputs.bw, h: inputs.h, d: d },
            { fck: fck, fywk: inputs.fykStirr }
        );
        const shearResult = shearVerifier.designStirrupsELU(Vsd);
        const AswFinal = Number.isFinite(shearResult.Asw_final) ? shearResult.Asw_final : 0;
        const shearUtil = Asw_s > 0 ? (AswFinal / Asw_s) * 100 : 0;
        const bielaUtil = Number.isFinite(shearResult.ratioBiela) ? shearResult.ratioBiela : 0;
        const shearUtilMax = Math.max(shearUtil, bielaUtil);
        const shearOk = shearResult.status === 'OK' && shearUtilMax <= 100;

        const fatigueAtX = getCaseAtX(fatigueData, section.x);
        const fatigueMmax = fatigueAtX ? fatigueAtX.M_max : section.M_max;
        const fatigueMmin = fatigueAtX ? fatigueAtX.M_min : section.M_min;
        const fatigueVerifier = new FatigueVerifier(
            { bw: inputs.bw, h: inputs.h, d: d },
            { fck: fck, fyk: inputs.fykLong },
            AsProv,
            inputs.barPhi
        );
        const fatigueResult = fatigueVerifier.verifySteelFatigue(fatigueMmax || 0, fatigueMmin || 0);
        const fatigueUtil = fatigueResult.utilizacao || 0;
        const fatigueOk = fatigueResult.status === 'OK';

        // Passo 1: Armadura Mínima (NBR 6118 Item 17.3.5.2.1)
        const As_min = 0.0015 * inputs.bw * inputs.h;
        const asMinUtil = AsTension > 0 ? (As_min / AsTension) * 100 : 0;
        const asMinOk = AsTension >= As_min;

        // Passo 2: Armadura Máxima (NBR 6118 Item 17.3.5.2.4)
        const As_max = 0.04 * inputs.bw * inputs.h;
        const asMaxUtil = As_max > 0 ? (AsTension / As_max) * 100 : 0;
        const asMaxOk = AsTension <= As_max;

        // Passo 3: Fadiga do Concreto (NBR 6118 Item 23.5.4.1)
        const concFatigueResult = fatigueVerifier.verifyConcreteCompressionFatigue(fatigueMmax || 0);
        const concFatigueUtil = concFatigueResult.utilizacao || 0;
        const concFatigueOk = concFatigueResult.status === 'OK';

        // Passo 4: Ductilidade (NBR 6118 Item 14.6.4.3)
        const xi = flexResult.xi || 0;
        const xiUtil = (xi / 0.45) * 100;
        const xiOk = xi <= 0.45;

        // Passo 5: Fissuração ELS-W (NBR 6118 Item 13.4.2)
        const dLinha = computeCompressionCover(inputs);
        const serviceVerifier = new ServiceabilityVerifier(
            { bw: inputs.bw, h: inputs.h, d: d },
            { fck: fck, fyk: inputs.fykLong },
            AsProv,
            { phi: inputs.barPhi, d_linha: dLinha, wk_lim: inputs.wkLim, As_linha: inputs.asComp }
        );
        const elsFreqData = loadProcessor.getLoadCaseData('ELS_FREQ');
        const elsFreqAtX = getCaseAtX(elsFreqData, section.x);
        const M_freq = elsFreqAtX
            ? Math.max(Math.abs(elsFreqAtX.M_max || 0), Math.abs(elsFreqAtX.M_min || 0))
            : momentAbs;
        const crackResult = serviceVerifier.verifyCrackWidth(M_freq);
        const crackUtil = crackResult.utilizacao || 0;
        const crackOk = crackResult.status === 'OK';

        const cardOk = flexOk && shearOk && fatigueOk && asMinOk && asMaxOk && concFatigueOk && xiOk && crackOk;
        const cardClass = cardOk ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50';
        const badgeClass = cardOk ? 'bg-emerald-500' : 'bg-amber-500';
        const badgeLabel = cardOk ? 'OK' : 'ALERTA';

        return `
            <button type="button" data-section-id="${section.id}" class="section-card border ${cardClass} rounded-lg p-4 text-left w-full">
                <div class="flex items-start justify-between">
                    <div>
                        <div class="text-sm font-semibold text-gray-800">${section.name}</div>
                        <div class="text-xs text-gray-500">x = ${section.x.toFixed(1)} m</div>
                    </div>
                    <span class="text-[10px] font-semibold px-2 py-1 rounded ${badgeClass} text-white">${badgeLabel}</span>
                </div>
                <div class="mt-3 space-y-2">
                    ${buildUtilRow('Flexao ELU', flexUtil, flexOk)}
                    ${buildUtilRow('Cisalhamento', shearUtilMax, shearOk)}
                    ${buildUtilRow('Fadiga Aco', fatigueUtil, fatigueOk)}
                    ${buildUtilRow('Arm. Mínima', asMinUtil, asMinOk)}
                    ${buildUtilRow('Arm. Máxima', asMaxUtil, asMaxOk)}
                    ${buildUtilRow('Fadiga Conc.', concFatigueUtil, concFatigueOk)}
                    ${buildUtilRow('Ductilidade', xiUtil, xiOk)}
                    ${buildUtilRow('Fissuração', crackUtil, crackOk)}
                </div>
                <div class="mt-3 text-xs text-gray-500">
                    M = ${formatNumber(section.M_max)} / ${formatNumber(section.M_min)} kN.m<br>
                    V = ${formatNumber(section.V_max)} / ${formatNumber(section.V_min)} kN
                </div>
            </button>
        `;
    }).join('');

    container.querySelectorAll('.section-card').forEach((card) => {
        card.addEventListener('click', () => {
            const id = card.dataset.sectionId;
            if (!id) return;
            selectedDetailSectionId = id;
            renderDetailSectionList();
            updateDetailView();
            const detailsTab = document.querySelector('.tab-btn[data-tab="details"]');
            if (detailsTab) detailsTab.click();
        });
    });
}

/**
 * Executa o cÃ¡lculo completo
 */
function runCalculation() {
    if (!loadProcessor) {
        loadProcessor = new LoadProcessor();
    }
    syncImpactInputs();
    const inputs = getDetailInputs();
    if (loadProcessor.setLoadFactors) {
        loadProcessor.setLoadFactors({ cnf: inputs.cnf, civ: inputs.civ, cia: inputs.cia });
    }
    loadProcessor.processGlobalGeometry();

    renderLoadCaseFilters();
    updateCharts(currentLoadCase);
    updateChartFormula();

    const infoBeam = document.getElementById('info-beam');
    const summary = loadProcessor.getSummary();
    const nBars = parseInt(document.getElementById('inp-nbars')?.value || '0', 10);
    const barPhi = parseFloat(document.getElementById('inp-phi')?.value || '0');
    const barDia = barPhi / 10;
    const As = nBars > 0 ? nBars * Math.PI * (barDia / 2) ** 2 : 0;

    if (infoBeam) {
        infoBeam.innerHTML = `
            <strong>Viga Cont&iacute;nua:</strong> ${summary.totalLength} m<br>
            <strong>Frames:</strong> ${summary.numFrames}<br>
            <strong>A<sub>s</sub> provida:</strong> ${As.toFixed(2)} cm<sup>2</sup>
        `;
        infoBeam.classList.remove('hidden');
    }

    const sections = loadProcessor.findCriticalSections();
    updateCriticalSections(sections);
    updateDeflectionChart();
    updateSummary();
    refreshDetailSections(sections);
    updateMemoriaCalculo(sections);
}

/**
 * Atualiza o painel de resumo
 */
function updateSummary() {
    const summaryContent = document.getElementById('detail-summary');
    if (!summaryContent || !loadProcessor) {
        return;
    }
    const data = loadProcessor.getLoadCaseData('ELU') || {};
    const MmaxValues = data.M_max || [];
    const MminValues = data.M_min || [];
    const VmaxValues = data.V_max || [];
    const VminValues = data.V_min || [];

    const M_max = MmaxValues.length ? Math.max(...MmaxValues) : 0;
    const M_min = MminValues.length ? Math.min(...MminValues) : 0;
    const V_max = Math.max(
        VmaxValues.length ? Math.max(...VmaxValues.map(Math.abs)) : 0,
        VminValues.length ? Math.max(...VminValues.map(Math.abs)) : 0
    );

    summaryContent.innerHTML = `
        <div class="bg-blue-50 rounded-lg p-3 text-center">
            <div class="text-xs text-gray-500">Comprimento Total</div>
            <div class="text-lg font-semibold text-blue-700">${loadProcessor.totalLength} m</div>
        </div>
        <div class="bg-green-50 rounded-lg p-3 text-center">
            <div class="text-xs text-gray-500">M<sub>max</sub> ELU (kN.m)</div>
            <div class="text-lg font-semibold text-green-700">${M_max.toFixed(0)}</div>
        </div>
        <div class="bg-red-50 rounded-lg p-3 text-center">
            <div class="text-xs text-gray-500">M<sub>min</sub> ELU (kN.m)</div>
            <div class="text-lg font-semibold text-red-700">${M_min.toFixed(0)}</div>
        </div>
        <div class="bg-orange-50 rounded-lg p-3 text-center">
            <div class="text-xs text-gray-500">V<sub>max</sub> ELU (kN)</div>
            <div class="text-lg font-semibold text-orange-700">${V_max.toFixed(0)}</div>
        </div>
    `;
}

/**
 * Detalhamento e layout
 */
function getInputElements(id) {
    return Array.from(document.querySelectorAll(`[id="${id}"]`));
}

function getInputElement(id) {
    const detailEl = document.querySelector(`#tab-details [id="${id}"]`);
    return detailEl || document.getElementById(id);
}

function getNumericValue(id, fallback) {
    const el = getInputElement(id);
    if (!el) return fallback;
    const val = parseFloat(el.value);
    return Number.isFinite(val) ? val : fallback;
}

function getSelectLabel(id, fallback) {
    const el = getInputElement(id);
    if (!el || !el.options || el.selectedIndex < 0) return fallback;
    return el.options[el.selectedIndex]?.text || fallback;
}

function getDetailInputs() {
    const bw = getNumericValue('inp-bw', 30);
    const h = getNumericValue('inp-h', 60);
    const cover = getNumericValue('inp-cover', 3);
    const nBars = Math.max(1, parseInt(getNumericValue('inp-nbars', 5), 10));
    const barPhi = getNumericValue('inp-phi', 20);
    const nBarsComp = Math.max(0, parseInt(getNumericValue('inp-nbars-comp', 0), 10));
    const barPhiComp = getNumericValue('inp-phi-comp', 12.5);
    const layers = Math.max(1, parseInt(getNumericValue('inp-layers', 3), 10));
    const clearSpacing = getNumericValue('inp-clear-spacing', 2.5);
    const stirrPhi = getNumericValue('inp-stirr-phi', 8);
    const stirrSpacing = getNumericValue('inp-stirr-s', 15);
    const fykLong = getNumericValue('inp-fyk-long', 500);
    const fykStirr = getNumericValue('inp-fyk-stirr', 500);
    const fykLongLabel = getSelectLabel('inp-fyk-long', 'CA-50');
    const fykStirrLabel = getSelectLabel('inp-fyk-stirr', 'CA-50');
    const wkLim = getNumericValue('inp-wk-lim', 0.30);
    const caaLabel = getSelectLabel('inp-caa', 'CAA II');
    const span = getNumericValue('inp-span', 12);
    const cia = getNumericValue('inp-cia', 1.25);
    const cnf = getNumericValue('inp-cnf', 1.0);
    const civ = computeCiv(span);
    const asComp = computeAsCompressed({ nBarsComp, barPhiComp });

    return {
        bw,
        h,
        cover,
        nBars,
        barPhi,
        nBarsComp,
        barPhiComp,
        layers,
        clearSpacing,
        stirrPhi,
        stirrSpacing,
        fykLong,
        fykStirr,
        fykLongLabel,
        fykStirrLabel,
        asComp,
        wkLim,
        caaLabel,
        span,
        cia,
        cnf,
        civ
    };
}

function getSelectedDetailSection() {
    if (!detailSections.length) {
        return null;
    }
    return detailSections.find(section => section.id === selectedDetailSectionId) || detailSections[0];
}

function getMomentInfo(section) {
    if (!section) {
        return { moment: 0, abs: 0, sign: 'neutro', isPositive: true };
    }
    const maxAbs = Math.abs(section.M_max || 0);
    const minAbs = Math.abs(section.M_min || 0);
    const moment = maxAbs >= minAbs ? section.M_max : section.M_min;
    const isPositive = moment >= 0;
    return {
        moment,
        abs: Math.abs(moment),
        sign: isPositive ? 'positivo' : 'negativo',
        isPositive
    };
}

function computeDomainData(inputs, momentValue, momentPositive = true) {
    const fck = getNumericValue('inp-fck', 30);
    let barDiaTension = (momentPositive ? inputs.barPhi : inputs.barPhiComp) / 10;
    let barDiaCompression = (momentPositive ? inputs.barPhiComp : inputs.barPhi) / 10;
    const stirrDia = inputs.stirrPhi / 10;
    let asTension = momentPositive ? computeAsProvided(inputs) : computeAsCompressed(inputs);
    let asCompression = momentPositive ? computeAsCompressed(inputs) : computeAsProvided(inputs);

    if (!(asTension > 0)) {
        asTension = computeAsProvided(inputs);
        asCompression = 0;
        barDiaTension = inputs.barPhi / 10;
        barDiaCompression = inputs.barPhiComp / 10;
    }

    const d = inputs.h - inputs.cover - stirrDia - (barDiaTension / 2);
    const dLinha = inputs.cover + stirrDia + (barDiaCompression / 2);

    if (!Number.isFinite(momentValue) || momentValue <= 0 || d <= 0) {
        return null;
    }

    const geometry = { bw: inputs.bw, h: inputs.h, d: d, c_nom: inputs.cover };
    const materials = { fck: fck, fyk: inputs.fykLong };
    const verifier = new BendingVerifier(geometry, materials);
    const useCompression = asCompression > 0 && asTension > 0;
    let design = useCompression
        ? verifier.calcNeutralAxisWithCompression(asTension, asCompression, d, dLinha)
        : verifier.designReinforcement(momentValue);

    if (useCompression && (design.valid === false || !Number.isFinite(design.xi))) {
        design = verifier.designReinforcement(momentValue);
    }

    if (design.status === 'ERROR' || design.valid === false) {
        return { ...design, d, domain: 'N/A' };
    }

    const xi23 = 0.259;
    let domain = 'II';
    if (design.xi > xi23 && design.xi <= design.xi_lim) {
        domain = 'III';
    } else if (design.xi > design.xi_lim) {
        domain = 'IV';
    }

    let warning = null;
    if (useCompression && design.xi > design.xi_lim) {
        warning = 'Aviso: armadura comprimida leva o estado para fora dos dominios 2 e 3.';
    }
    if (useCompression && Number.isFinite(design.Mrd) && momentValue > design.Mrd) {
        warning = warning || 'Aviso: momento critico excede o momento resistente com armadura dupla.';
    }

    return { ...design, d, domain, xi_23: xi23, warning, momentBase: momentValue };
}


// function computeDomainStrains was removed - moved to DomainVisualizer

function updateDomainOverlay(domainData) {
    if (!domainVisualizer) {
        // Inicializa na primeira chamada se necessário, ou garanta que o DOM já existe
        domainVisualizer = new DomainVisualizer('domain-line');
    }

    if (!domainData || !Number.isFinite(domainData.xi)) {
        domainVisualizer.hide();
        return;
    }

    const xi = domainData.xi;
    // Opcional: passar xi23 se variar
    // const xi23 = Number.isFinite(domainData.xi_23) ? domainData.xi_23 : 0.259;

    domainVisualizer.updateFromXi(xi);
}

function renderDomainPanel(section, momentInfo, domainData) {
    const panel = document.getElementById('detail-domain');
    const text = document.getElementById('domain-text');
    if (!panel || !text) return;

    if (!section || !momentInfo.abs) {
        text.innerHTML = 'Sem dados para calcular o domínio.';
        updateDomainOverlay(null);
        return;
    }

    const face = momentInfo.isPositive ? 'superior' : 'inferior';
    const domainLabel = domainData ? domainData.domain : 'N/A';
    const xi = domainData && Number.isFinite(domainData.xi) ? domainData.xi : null;
    const xi23 = (domainData && Number.isFinite(domainData.xi_23)) ? domainData.xi_23 : 0.259;
    const x = domainData && Number.isFinite(domainData.x) ? domainData.x : null;

    let strainsHtml = '';
    let warningHtml = '';
    let mrdHtml = '';
    if (xi !== null) {
        // Usa o método estático para calcular valores para exibição no texto
        const strains = DomainVisualizer.computeStrains(xi, xi23);
        if (strains) {
            const es = (strains.eps_s_clamped * 10).toFixed(2); // per mil
            const ec = (strains.eps_c_clamped * 10).toFixed(2); // per mil
            strainsHtml = `
                <div class="mt-2 pt-2 border-t border-gray-100">
                    <div class="flex justify-between text-xs">
                        <span>&epsilon;<sub>c</sub>:</span>
                        <span class="font-medium">${ec} ‰</span>
                    </div>
                    <div class="flex justify-between text-xs">
                        <span>&epsilon;<sub>s</sub>:</span>
                        <span class="font-medium">${es} ‰</span>
                    </div>
                </div>
            `;
        }
    }

    if (domainData && Number.isFinite(domainData.Mrd)) {
        mrdHtml = `<div class="text-xs text-gray-500">Mrd (armadura dupla): ${domainData.Mrd.toFixed(1)} kN.m</div>`;
    }
    if (domainData && domainData.warning) {
        warningHtml = `<div class="text-xs text-amber-600 mt-1">${domainData.warning}</div>`;
    }

    text.innerHTML = `
        <div class="text-sm font-semibold text-gray-800">Domínio ${domainLabel}</div>
        <div class="text-xs text-gray-500 mt-1">Momento crítico: ${momentInfo.moment.toFixed(1)} kN.m (${momentInfo.sign})</div>
        <div class="text-xs text-gray-500">Face comprimida: ${face}</div>
        ${x !== null ? `<div class="text-xs text-gray-500">Linha neutra: x = ${x.toFixed(2)} cm</div>` : ''}
        ${xi !== null ? `<div class="text-xs text-gray-500">x/d = ${xi.toFixed(3)}</div>` : ''}
        ${mrdHtml}
        ${warningHtml}
        ${strainsHtml}
    `;
    updateDomainOverlay(domainData);
}


const MEMORY_UNIT_DIGITS = {
    'kN': 1,
    'kN.m': 1,
    'kN.cm': 1,
    'cm': 2,
    'cm2': 2,
    'm': 2,
    'cm2/m': 2,
    'mm': 2,
    'MPa': 2,
    'GPa': 2,
    '1/cm': 6,
    '%': 1
};

function memNum(value, digits = 2) {
    return Number.isFinite(value) ? value.toFixed(digits) : '0.00';
}

function memUnit(value, unit, digitsOverride) {
    const digits = Number.isFinite(digitsOverride)
        ? digitsOverride
        : (MEMORY_UNIT_DIGITS[unit] ?? 2);
    return `${memNum(value, digits)} ${unit}`;
}

function memPercent(value, digits = 1) {
    return `${memNum(value, digits)} %`;
}

function getSimpleCaseAtX(data, x) {
    if (!data || !Array.isArray(data.stations) || !data.stations.length) {
        return { M: 0, V: 0 };
    }
    const idx = findClosestIndex(data.stations, x);
    return {
        M: data.M_values?.[idx] ?? 0,
        V: data.V_values?.[idx] ?? 0
    };
}

function buildBaseActionsAtX(x) {
    const dead = loadProcessor.getLoadCaseData('DEAD');
    const trilho = loadProcessor.getLoadCaseData('TRILHO');
    const envMovel = loadProcessor.getLoadCaseData('ENV_MOVEL');

    const deadAt = getSimpleCaseAtX(dead, x);
    const trilhoAt = getSimpleCaseAtX(trilho, x);
    const envAt = getCaseAtX(envMovel, x) || { M_max: 0, M_min: 0, V_max: 0, V_min: 0 };

    const M_perm = deadAt.M + trilhoAt.M;
    const V_perm = deadAt.V + trilhoAt.V;

    return {
        deadAt,
        trilhoAt,
        envAt,
        M_perm,
        V_perm
    };
}

function buildCombinationsAtX(x) {
    const base = buildBaseActionsAtX(x);
    const M_perm = base.M_perm;
    const V_perm = base.V_perm;

    const Mq_max = base.envAt.M_max || 0;
    const Mq_min = base.envAt.M_min || 0;
    const Vq_max = base.envAt.V_max || 0;
    const Vq_min = base.envAt.V_min || 0;

    return {
        base,
        combos: {
            ELU: {
                M_max: 1.4 * M_perm + 1.4 * Mq_max,
                M_min: 1.4 * M_perm + 1.4 * Mq_min,
                V_max: 1.4 * V_perm + 1.4 * Vq_max,
                V_min: 1.4 * V_perm + 1.4 * Vq_min
            },
            FADIGA: {
                M_max: 1.0 * M_perm + 1.0 * Mq_max,
                M_min: 1.0 * M_perm + 1.0 * Mq_min,
                V_max: 1.0 * V_perm + 1.0 * Vq_max,
                V_min: 1.0 * V_perm + 1.0 * Vq_min
            },
            ELS_QP: {
                M_max: 1.0 * M_perm + 0.5 * Mq_max,
                M_min: 1.0 * M_perm + 0.5 * Mq_min,
                V_max: 1.0 * V_perm + 0.5 * Vq_max,
                V_min: 1.0 * V_perm + 0.5 * Vq_min
            },
            ELS_FREQ: {
                M_max: 1.0 * M_perm + 0.8 * Mq_max,
                M_min: 1.0 * M_perm + 0.8 * Mq_min,
                V_max: 1.0 * V_perm + 0.8 * Vq_max,
                V_min: 1.0 * V_perm + 0.8 * Vq_min
            }
        }
    };
}

function buildDeflectionDetailBySpan(elsVerifier, moments, span) {
    const spanLength = span.endX - span.startX;
    if (spanLength <= 0) return null;

    const spanMoments = moments
        .filter((pt) => pt.x >= span.startX - 1e-6 && pt.x <= span.endX + 1e-6)
        .map((pt) => ({ x: pt.x - span.startX, M: pt.M }));

    if (spanMoments.length < 2) return null;

    const L_cm = spanLength * 100;
    const curvatures = spanMoments.map((pt) => {
        const EI_eq = elsVerifier.calcEquivalentStiffness(pt.M);
        const M_kNcm = pt.M * 100;
        return {
            x_cm: pt.x * 100,
            x_m: pt.x,
            M: pt.M,
            EI_eq: EI_eq,
            kappa: EI_eq > 0 ? M_kNcm / EI_eq : 0
        };
    });

    const rotations = [{ x_cm: curvatures[0].x_cm, theta: 0 }];
    for (let i = 1; i < curvatures.length; i++) {
        const dx = curvatures[i].x_cm - curvatures[i - 1].x_cm;
        const avgKappa = (curvatures[i].kappa + curvatures[i - 1].kappa) / 2;
        const theta = rotations[i - 1].theta + avgKappa * dx;
        rotations.push({ x_cm: curvatures[i].x_cm, theta: theta });
    }

    const deflections = [{ x_cm: rotations[0].x_cm, f: 0 }];
    for (let i = 1; i < rotations.length; i++) {
        const dx = rotations[i].x_cm - rotations[i - 1].x_cm;
        const avgTheta = (rotations[i].theta + rotations[i - 1].theta) / 2;
        const f = deflections[i - 1].f + avgTheta * dx;
        deflections.push({ x_cm: rotations[i].x_cm, f: f });
    }

    const f_L = deflections[deflections.length - 1].f;
    const points = deflections.map((pt, idx) => {
        const f0 = pt.f - f_L * (pt.x_cm / L_cm);
        return {
            x_m: curvatures[idx].x_m,
            M: curvatures[idx].M,
            EI_eq: curvatures[idx].EI_eq,
            kappa: curvatures[idx].kappa,
            theta: rotations[idx].theta,
            f0: f0
        };
    });

    let maxDeflection = 0;
    let maxX = 0;
    for (const pt of points) {
        const absF = Math.abs(pt.f0);
        if (absF > Math.abs(maxDeflection)) {
            maxDeflection = pt.f0;
            maxX = pt.x_m;
        }
    }

    return {
        spanLength,
        points,
        maxDeflection,
        maxX
    };
}

function buildDeflectionDetailBySpans(elsVerifier, moments, frames, totalLength) {
    const spans = Array.isArray(frames) && frames.length
        ? frames.map((frame) => {
            const startX = Number.isFinite(frame.startX) ? frame.startX : 0;
            const endX = Number.isFinite(frame.endX)
                ? frame.endX
                : (Number.isFinite(frame.length) ? startX + frame.length : totalLength || 0);
            return { startX, endX };
        })
        : [{ startX: 0, endX: totalLength || 0 }];

    const alpha_f = elsVerifier.calcCreepFactor();
    const factor = 1 + alpha_f;

    const spanDetails = [];
    for (const span of spans) {
        const detail = buildDeflectionDetailBySpan(elsVerifier, moments, span);
        if (!detail) continue;

        const f_total = Math.abs(detail.maxDeflection) * factor;
        const f_lim = (detail.spanLength * 100) / 250;
        const utilization = f_lim > 0 ? (f_total / f_lim) * 100 : 0;
        const status = f_total <= f_lim ? 'OK' : 'FAIL';

        spanDetails.push({
            ...detail,
            span,
            alpha_f,
            factor,
            f_total,
            f_lim,
            utilization,
            status
        });
    }

    return {
        spans: spanDetails,
        alpha_f,
        factor
    };
}

function buildMemoriaDeflection(inputs, materials) {
    const container = [];
    const dataElsQp = loadProcessor.getLoadCaseData('ELS_QP');
    if (!dataElsQp || !Array.isArray(dataElsQp.stations) || dataElsQp.stations.length < 2) {
        return `
            <details class="border rounded-lg bg-white">
                <summary class="cursor-pointer px-4 py-3 font-semibold text-gray-700">ELS-QP (Flecha) - Por vao</summary>
                <div class="px-4 pb-4 text-xs text-gray-500">Sem dados suficientes para a flecha.</div>
            </details>
        `;
    }

    const bw = inputs.bw;
    const h = inputs.h;
    const fck = getNumericValue('inp-fck', 30);
    const fyk = inputs.fykLong;
    const d = computeEffectiveDepth(inputs);
    const As = computeAsProvided(inputs);
    const dLinha = computeCompressionCover(inputs);

    const elsVerifier = new ServiceabilityVerifier(
        { bw, h, d },
        { fck, fyk },
        As,
        { phi: inputs.barPhi, d_linha: dLinha, As_linha: inputs.asComp }
    );

    const moments = buildMomentSeries(dataElsQp);
    const detail = buildDeflectionDetailBySpans(
        elsVerifier,
        moments,
        loadProcessor.frames,
        loadProcessor.totalLength
    );

    const header = `
        <details class="border rounded-lg bg-white">
            <summary class="cursor-pointer px-4 py-3 font-semibold text-gray-700">ELS-QP (Flecha) - Por vao</summary>
            <div class="px-4 pb-4 space-y-4">
                <div class="text-xs text-gray-500">
                    Combina-se 1.0*G + 0.5*Q (quase permanente). A flecha total considera fluencia.
                </div>
                <div class="grid grid-cols-2 gap-3 text-xs text-gray-600">
                    <div><span class="text-gray-500">Ecs</span> ${memUnit(materials.concrete.Ecs, 'MPa')}</div>
                    <div><span class="text-gray-500">fctm</span> ${memUnit(materials.concrete.fctm, 'MPa')}</div>
                    <div><span class="text-gray-500">Mr</span> ${memUnit(elsVerifier.Mr, 'kN.m')}</div>
                    <div><span class="text-gray-500">Ic</span> ${memNum(elsVerifier.Ic, 0)} cm4</div>
                    <div><span class="text-gray-500">I_II</span> ${memNum(elsVerifier.I_II, 0)} cm4</div>
                    <div><span class="text-gray-500">alpha_f</span> ${memNum(detail.alpha_f, 3)}</div>
                </div>
    `;

    container.push(header);

    detail.spans.forEach((spanDetail, idx) => {
        const rows = spanDetail.points.map((pt) => `
            <tr>
                <td class="px-2 py-1">${memNum(pt.x_m, 2)}</td>
                <td class="px-2 py-1">${memNum(pt.M, 2)}</td>
                <td class="px-2 py-1">${memNum(pt.EI_eq, 0)}</td>
                <td class="px-2 py-1">${memNum(pt.kappa, 6)}</td>
                <td class="px-2 py-1">${memNum(pt.theta, 6)}</td>
                <td class="px-2 py-1">${memNum(pt.f0, 3)}</td>
                <td class="px-2 py-1">${memNum(pt.f0 * spanDetail.factor, 3)}</td>
            </tr>
        `).join('');

        container.push(`
            <details class="border rounded-lg bg-slate-50">
                <summary class="cursor-pointer px-4 py-2 text-sm font-semibold text-gray-700">
                    Vao ${idx + 1} | L = ${memUnit(spanDetail.spanLength, 'm', 2)} | f_total = ${memUnit(spanDetail.f_total, 'cm')} | limite = ${memUnit(spanDetail.f_lim, 'cm')} | ${spanDetail.status}
                </summary>
                <div class="px-4 pb-4 space-y-3 text-xs text-gray-600">
                    <div>
                        <div class="font-semibold text-gray-700 mb-1">Formulas principais</div>
                        <pre class="whitespace-pre-wrap bg-white border rounded p-3 text-xs text-gray-700">
EI_eq = Ecs * Ic * (Mr/Ma)^3 + Ecs * I_II * (1 - (Mr/Ma)^3)
curvatura kappa = M / EI_eq
rotacao: theta_i = theta_{i-1} + (kappa_i + kappa_{i-1})/2 * dx
flecha: f_i = f_{i-1} + (theta_i + theta_{i-1})/2 * dx
ajuste: f_corr = f - f(L) * x / L
flecha total: f_total = f0 * (1 + alpha_f)
limite: f_lim = L/250
                        </pre>
                    </div>
                    <div>
                        <div class="font-semibold text-gray-700 mb-1">Tabela passo a passo (integracao numerica)</div>
                        <div class="overflow-auto border rounded bg-white">
                            <table class="min-w-full text-xs">
                                <thead class="bg-slate-100 text-gray-600">
                                    <tr>
                                        <th class="px-2 py-1 text-left">x (m)</th>
                                        <th class="px-2 py-1 text-left">M (kN.m)</th>
                                        <th class="px-2 py-1 text-left">EI_eq (kN.cm2)</th>
                                        <th class="px-2 py-1 text-left">kappa (1/cm)</th>
                                        <th class="px-2 py-1 text-left">theta</th>
                                        <th class="px-2 py-1 text-left">f0 (cm)</th>
                                        <th class="px-2 py-1 text-left">f_total (cm)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>f0,max = ${memUnit(Math.abs(spanDetail.maxDeflection), 'cm')}</div>
                        <div>alpha_f = ${memNum(spanDetail.alpha_f, 3)}</div>
                        <div>f_total = ${memUnit(spanDetail.f_total, 'cm')}</div>
                        <div>f_lim = ${memUnit(spanDetail.f_lim, 'cm')}</div>
                        <div>utilizacao = ${memPercent(spanDetail.utilization)}</div>
                    </div>
                </div>
            </details>
        `);
    });

    container.push('</div></details>');
    return container.join('');
}

function buildSectionMemory(section, inputs, materials) {
    const fck = getNumericValue('inp-fck', 30);
    const d = computeEffectiveDepth(inputs);
    const AsProv = computeAsProvided(inputs);
    const AsComp = inputs.asComp;
    const dLinha = computeCompressionCover(inputs);

    const combosAtX = buildCombinationsAtX(section.x);
    const base = combosAtX.base;
    const combos = combosAtX.combos;

    const momentCandidateMax = combos.ELU.M_max || 0;
    const momentCandidateMin = combos.ELU.M_min || 0;
    const moment = Math.abs(momentCandidateMax) >= Math.abs(momentCandidateMin)
        ? momentCandidateMax
        : momentCandidateMin;
    const momentAbs = Math.abs(moment);
    const momentPositive = moment >= 0;

    let AsTension = momentPositive ? AsProv : AsComp;
    let AsCompression = momentPositive ? AsComp : AsProv;
    let barDiaTension = momentPositive ? inputs.barPhi : inputs.barPhiComp;
    let barDiaCompression = momentPositive ? inputs.barPhiComp : inputs.barPhi;
    if (!(AsTension > 0)) {
        AsTension = AsProv;
        AsCompression = 0;
        barDiaTension = inputs.barPhi;
        barDiaCompression = inputs.barPhiComp;
    }

    const stirrDia = inputs.stirrPhi / 10;
    const dFlex = inputs.h - inputs.cover - stirrDia - (barDiaTension / 10) / 2;
    const dLinhaFlex = inputs.cover + stirrDia + (barDiaCompression / 10) / 2;

    const bendingVerifier = new BendingVerifier(
        { bw: inputs.bw, h: inputs.h, d: dFlex, c_nom: inputs.cover },
        { fck: fck, fyk: inputs.fykLong }
    );
    let flexUsesCompression = AsCompression > 0 && AsTension > 0;
    let flexResult = null;
    if (!(AsTension > 0)) {
        flexUsesCompression = false;
        flexResult = { status: 'ERROR', utilizacao: 0, xi: 0 };
    } else if (flexUsesCompression) {
        flexResult = bendingVerifier.verifySectionWithCompression(momentAbs, AsTension, AsCompression, dFlex, dLinhaFlex);
        if (flexResult.status === 'ERROR') {
            flexUsesCompression = false;
            flexResult = bendingVerifier.verifySection(momentAbs, AsTension);
        }
    } else {
        flexResult = bendingVerifier.verifySection(momentAbs, AsTension);
    }

    const Vsd = Math.max(Math.abs(combos.ELU.V_max || 0), Math.abs(combos.ELU.V_min || 0));
    const shearVerifier = new ShearVerifier(
        { bw: inputs.bw, h: inputs.h, d: d },
        { fck: fck, fywk: inputs.fykStirr }
    );
    const shearResult = shearVerifier.designStirrupsELU(Vsd);
    const Asw_s = computeStirrupAsw(inputs);
    const AswFinal = Number.isFinite(shearResult.Asw_final) ? shearResult.Asw_final : 0;
    const shearUtil = Asw_s > 0 ? (AswFinal / Asw_s) * 100 : 0;
    const bielaUtil = Number.isFinite(shearResult.ratioBiela) ? shearResult.ratioBiela : 0;

    const fatigueVerifier = new FatigueVerifier(
        { bw: inputs.bw, h: inputs.h, d: d },
        { fck: fck, fyk: inputs.fykLong },
        AsProv,
        inputs.barPhi
    );
    const fatigueResult = fatigueVerifier.verifySteelFatigue(combos.FADIGA.M_max || 0, combos.FADIGA.M_min || 0);
    const concFatigueResult = fatigueVerifier.verifyConcreteCompressionFatigue(combos.FADIGA.M_max || 0);

    const serviceVerifier = new ServiceabilityVerifier(
        { bw: inputs.bw, h: inputs.h, d: d },
        { fck: fck, fyk: inputs.fykLong },
        AsProv,
        { phi: inputs.barPhi, d_linha: dLinha, wk_lim: inputs.wkLim, As_linha: AsComp }
    );
    const M_freq = Math.max(Math.abs(combos.ELS_FREQ.M_max || 0), Math.abs(combos.ELS_FREQ.M_min || 0));
    const crackResult = serviceVerifier.verifyCrackWidth(M_freq);

    const fcd = materials.concrete.fcd;
    const sigma_cd = materials.concrete.sigmaCD;
    const fyd = materials.steel.fyd;
    const fctm = materials.concrete.fctm;
    const fctk_inf = materials.concrete.fctk_inf;
    const fctd = materials.concrete.fctd;
    const Es = materials.steel.Es;
    const Ecs = materials.concrete.Ecs;

    const Md = momentAbs;
    const Md_kNcm = Md * 100;
    const sigma_cd_kNcm2 = sigma_cd * 0.1;
    const fyd_kNcm2 = fyd * 0.1;
    const lambda = 0.8;
    const a = 0.5 * lambda ** 2 * inputs.bw * sigma_cd_kNcm2;
    const b = -lambda * inputs.bw * sigma_cd_kNcm2 * dFlex;
    const c = Md_kNcm;
    const delta = b ** 2 - 4 * a * c;

    const xi = flexResult.xi || 0;
    const z = flexResult.z || 0;

    const As_min = 0.0015 * inputs.bw * inputs.h;
    const As_max = 0.04 * inputs.bw * inputs.h;

    const alphaV2 = 1 - fck / 250;
    const fcd_kNcm2 = fcd * 0.1;
    const Vrd2 = 0.27 * alphaV2 * fcd_kNcm2 * inputs.bw * d;
    const fctd_kNcm2 = fctd * 0.1;
    const Vc0 = 0.6 * fctd_kNcm2 * inputs.bw * d;
    const Vsw = Math.max(0, Vsd - Vc0);
    const fywd = Math.min(inputs.fykStirr / 1.15, 435);
    const fywd_kNcm2 = fywd * 0.1;
    const Asw_calc = Vsw > 0 ? (Vsw / (0.9 * d * fywd_kNcm2)) * 100 : 0;
    const rhoSwMin = 0.2 * fctm / inputs.fykStirr;
    const Asw_min = rhoSwMin * inputs.bw * 100;
    const sMax = Vsd <= 0.67 * Vrd2 ? Math.min(0.6 * d, 30) : Math.min(0.3 * d, 20);

    const n = Es / Ecs;
    const xII_fad = fatigueVerifier.x_II || 0;
    const I_II_fad = fatigueVerifier.I_II || 0;
    const sigmaMax = fatigueResult.sigmaMax || 0;
    const sigmaMin = fatigueResult.sigmaMin || 0;
    const deltaSigma = fatigueResult.deltaSigma || 0;

    const h_cri = 2.5 * (inputs.h - d);
    const Acri = inputs.bw * Math.min(h_cri, inputs.h / 2);
    const rho_ri = Acri > 0 ? AsProv / Acri : 0;
    const sigma_si = serviceVerifier.calcSteelStress(M_freq);
    const wk1 = (inputs.barPhi / (12.5 * 2.25)) * (sigma_si / Es) * (3 * sigma_si / fctm);
    const wk2 = (inputs.barPhi / (12.5 * 2.25)) * (sigma_si / Es) * (4 / rho_ri + 45);
    const wk = Math.min(wk1, wk2);

    const inputsHtml = `
        <div class="bg-slate-50 border rounded-lg p-3">
            <div class="text-xs font-semibold text-gray-700 mb-2">Dados de entrada (secao retangular)</div>
            <div class="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>bw = ${memUnit(inputs.bw, 'cm')}</div>
                <div>h = ${memUnit(inputs.h, 'cm')}</div>
                <div>c_nom = ${memUnit(inputs.cover, 'cm')}</div>
                <div>d = ${memUnit(dFlex, 'cm')}</div>
                <div>d' = ${memUnit(dLinhaFlex, 'cm')}</div>
                <div>n_barras_tracao = ${inputs.nBars}</div>
                <div>phi_tracao = ${memUnit(inputs.barPhi, 'mm')}</div>
                <div>As_tracao = ${memUnit(AsProv, 'cm2')}</div>
                <div>n_barras_comp = ${inputs.nBarsComp}</div>
                <div>phi_comp = ${memUnit(inputs.barPhiComp, 'mm')}</div>
                <div>As_comp = ${memUnit(AsComp, 'cm2')}</div>
                <div>phi_est = ${memUnit(inputs.stirrPhi, 'mm')}</div>
                <div>fck = ${memUnit(fck, 'MPa')}</div>
                <div>fyk = ${memUnit(inputs.fykLong, 'MPa')}</div>
                <div>fywk = ${memUnit(inputs.fykStirr, 'MPa')}</div>
                <div>wk_lim = ${memUnit(inputs.wkLim, 'mm')}</div>
                <div>CAA = ${inputs.caaLabel}</div>
                <div>CIV = ${memNum(inputs.civ, 3)}</div>
                <div>CIA = ${memNum(inputs.cia, 2)}</div>
                <div>CNF = ${memNum(inputs.cnf, 2)}</div>
            </div>
        </div>
    `;

    const combosHtml = `
        <div class="bg-slate-50 border rounded-lg p-3">
            <div class="text-xs font-semibold text-gray-700 mb-2">Combinacoes no ponto x</div>
            <div class="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>G (Mgk) = ${memUnit(base.deadAt.M, 'kN.m')}</div>
                <div>T (Mtk) = ${memUnit(base.trilhoAt.M, 'kN.m')}</div>
                <div>Q_max = ${memUnit(base.envAt.M_max, 'kN.m')}</div>
                <div>Q_min = ${memUnit(base.envAt.M_min, 'kN.m')}</div>
                <div>Vg = ${memUnit(base.deadAt.V, 'kN')}</div>
                <div>Vt = ${memUnit(base.trilhoAt.V, 'kN')}</div>
                <div>Vq_max = ${memUnit(base.envAt.V_max, 'kN')}</div>
                <div>Vq_min = ${memUnit(base.envAt.V_min, 'kN')}</div>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>ELU: M_max = ${memUnit(combos.ELU.M_max, 'kN.m')} | M_min = ${memUnit(combos.ELU.M_min, 'kN.m')}</div>
                <div>ELU: V_max = ${memUnit(combos.ELU.V_max, 'kN')} | V_min = ${memUnit(combos.ELU.V_min, 'kN')}</div>
                <div>FADIGA: M_max = ${memUnit(combos.FADIGA.M_max, 'kN.m')} | M_min = ${memUnit(combos.FADIGA.M_min, 'kN.m')}</div>
                <div>FADIGA: V_max = ${memUnit(combos.FADIGA.V_max, 'kN')} | V_min = ${memUnit(combos.FADIGA.V_min, 'kN')}</div>
                <div>ELS-QP: M_max = ${memUnit(combos.ELS_QP.M_max, 'kN.m')} | M_min = ${memUnit(combos.ELS_QP.M_min, 'kN.m')}</div>
                <div>ELS-QP: V_max = ${memUnit(combos.ELS_QP.V_max, 'kN')} | V_min = ${memUnit(combos.ELS_QP.V_min, 'kN')}</div>
                <div>ELS-FREQ: M_max = ${memUnit(combos.ELS_FREQ.M_max, 'kN.m')} | M_min = ${memUnit(combos.ELS_FREQ.M_min, 'kN.m')}</div>
                <div>ELS-FREQ: V_max = ${memUnit(combos.ELS_FREQ.V_max, 'kN')} | V_min = ${memUnit(combos.ELS_FREQ.V_min, 'kN')}</div>
            </div>
        </div>
    `;

    const flexLines = flexUsesCompression ? `
Md = max(|M_elu_max|, |M_elu_min|) = max(|${memUnit(combos.ELU.M_max, 'kN.m')}|, |${memUnit(combos.ELU.M_min, 'kN.m')}|) = ${memUnit(Md, 'kN.m')}
As_tracao = ${memUnit(AsTension, 'cm2')}
As_comp = ${memUnit(AsCompression, 'cm2')}
d = ${memUnit(dFlex, 'cm')}
d' = ${memUnit(dLinhaFlex, 'cm')}
x = ${memUnit(flexResult.x, 'cm')}
xi = x/d = ${memNum(xi, 3)} (limite 0.45)
Mrd (armadura dupla) = ${memUnit(flexResult.Mrd || 0, 'kN.m')}
utilizacao = Md/Mrd = ${memPercent(flexResult.utilizacao || 0)}
status = ${flexResult.status}
    ` : `
Md = max(|M_elu_max|, |M_elu_min|) = max(|${memUnit(combos.ELU.M_max, 'kN.m')}|, |${memUnit(combos.ELU.M_min, 'kN.m')}|) = ${memUnit(Md, 'kN.m')}
Md = ${memUnit(Md_kNcm, 'kN.cm')}
fcd = fck/1.4 = ${fck}/1.4 = ${memUnit(fcd, 'MPa')}
sigma_cd = 0.85*fcd = 0.85*${memUnit(fcd, 'MPa')} = ${memUnit(sigma_cd, 'MPa')}
a = 0.5*lambda^2*bw*sigma_cd = ${memNum(a, 4)}
b = -lambda*bw*sigma_cd*d = ${memNum(b, 4)}
c = Md = ${memNum(c, 2)}
delta = b^2 - 4ac = ${memNum(delta, 2)}
x = ${memUnit(flexResult.x, 'cm')}
xi = x/d = ${memNum(xi, 3)} (limite 0.45)
z = d - 0.5*lambda*x = ${memUnit(z, 'cm')}
fyd = fyk/1.15 = ${inputs.fykLong}/1.15 = ${memUnit(fyd, 'MPa')}
As_calc = Md/(fyd*z) = ${memUnit(flexResult.As_calc, 'cm2')}
As_min = 0.0015*bw*h = ${memUnit(As_min, 'cm2')}
As_final = max(As_calc, As_min) = ${memUnit(flexResult.As_final, 'cm2')}
utilizacao = As_final/As_prov = ${memPercent(flexResult.utilizacao || 0)}
status = ${flexResult.status}
    `;

    const flexHtml = `
        <details class="border rounded-lg bg-white">
            <summary class="cursor-pointer px-4 py-2 text-sm font-semibold text-gray-700">Flexao ELU</summary>
            <div class="px-4 pb-4 space-y-2 text-xs text-gray-600">
                <pre class="whitespace-pre-wrap bg-slate-50 border rounded p-3">${flexLines}</pre>
            </div>
        </details>
    `;

    const shearHtml = `
        <details class="border rounded-lg bg-white">
            <summary class="cursor-pointer px-4 py-2 text-sm font-semibold text-gray-700">Cisalhamento</summary>
            <div class="px-4 pb-4 space-y-2 text-xs text-gray-600">
                <pre class="whitespace-pre-wrap bg-slate-50 border rounded p-3">
Vsd = max(|V_elu_max|, |V_elu_min|) = max(|${memUnit(combos.ELU.V_max, 'kN')}|, |${memUnit(combos.ELU.V_min, 'kN')}|) = ${memUnit(Vsd, 'kN')}
alpha_v2 = 1 - fck/250 = 1 - ${fck}/250 = ${memNum(alphaV2, 4)}
Vrd2 = 0.27*alpha_v2*fcd*bw*d = ${memUnit(Vrd2, 'kN')}
fctm = 0.3*fck^(2/3) = ${memUnit(fctm, 'MPa')}
fctk_inf = 0.7*fctm = ${memUnit(fctk_inf, 'MPa')}
fctd = fctk_inf/1.4 = ${memUnit(fctd, 'MPa')}
Vc0 = 0.6*fctd*bw*d = ${memUnit(Vc0, 'kN')}
Vsw = max(0, Vsd - Vc0) = ${memUnit(Vsw, 'kN')}
fywd = min(fywk/1.15, 435) = ${memUnit(fywd, 'MPa')}
Asw_calc = Vsw/(0.9*d*fywd) = ${memUnit(Asw_calc, 'cm2/m')}
Asw_min = 0.2*fctm/fywk*bw*100 = ${memUnit(Asw_min, 'cm2/m')}
Asw_final = max(Asw_calc, Asw_min) = ${memUnit(AswFinal, 'cm2/m')}
Asw_prov = ${memUnit(Asw_s, 'cm2/m')}
utilizacao = max(Asw_final/Asw_prov, Vsd/Vrd2) = ${memPercent(Math.max(shearUtil, bielaUtil), 1)}
s_max = ${memUnit(sMax, 'cm')}
status = ${shearResult.status}
                </pre>
            </div>
        </details>
    `;

    const fatigueSteelHtml = `
        <details class="border rounded-lg bg-white">
            <summary class="cursor-pointer px-4 py-2 text-sm font-semibold text-gray-700">Fadiga Aco</summary>
            <div class="px-4 pb-4 space-y-2 text-xs text-gray-600">
                <pre class="whitespace-pre-wrap bg-slate-50 border rounded p-3">
M_max = ${memUnit(combos.FADIGA.M_max, 'kN.m')}
M_min = ${memUnit(combos.FADIGA.M_min, 'kN.m')}
alpha_e = Es/Ecs = ${Es}/${memNum(Ecs, 2)} = ${memNum(n, 3)}
x_II = ${memUnit(xII_fad, 'cm')}
I_II = ${memNum(I_II_fad, 0)} cm4
sigma_s,max = ${memUnit(sigmaMax, 'MPa')}
sigma_s,min = ${memUnit(sigmaMin, 'MPa')}
Delta_sigma = ${memUnit(deltaSigma, 'MPa')}
limite = ${memUnit(fatigueResult.limite || 0, 'MPa')}
utilizacao = ${memPercent(fatigueResult.utilizacao || 0)}
status = ${fatigueResult.status}
                </pre>
            </div>
        </details>
    `;

    const fatigueConcHtml = `
        <details class="border rounded-lg bg-white">
            <summary class="cursor-pointer px-4 py-2 text-sm font-semibold text-gray-700">Fadiga Concreto</summary>
            <div class="px-4 pb-4 space-y-2 text-xs text-gray-600">
                <pre class="whitespace-pre-wrap bg-slate-50 border rounded p-3">
sigma_c,max = ${memUnit(concFatigueResult.sigmaC || 0, 'MPa')}
limite = 0.45*fcd = ${memUnit(materials.concrete.fcd_fad, 'MPa')}
utilizacao = ${memPercent(concFatigueResult.utilizacao || 0)}
status = ${concFatigueResult.status}
                </pre>
            </div>
        </details>
    `;

    const minMaxHtml = `
        <details class="border rounded-lg bg-white">
            <summary class="cursor-pointer px-4 py-2 text-sm font-semibold text-gray-700">Armadura Minima / Maxima</summary>
            <div class="px-4 pb-4 space-y-2 text-xs text-gray-600">
                <pre class="whitespace-pre-wrap bg-slate-50 border rounded p-3">
As_min = 0.0015*bw*h = ${memUnit(As_min, 'cm2')}
As_max = 0.04*bw*h = ${memUnit(As_max, 'cm2')}
As_prov = ${memUnit(AsTension, 'cm2')}
min_ok = ${AsTension >= As_min ? 'OK' : 'ALERTA'}
max_ok = ${AsTension <= As_max ? 'OK' : 'ALERTA'}
                </pre>
            </div>
        </details>
    `;

    const ductilityHtml = `
        <details class="border rounded-lg bg-white">
            <summary class="cursor-pointer px-4 py-2 text-sm font-semibold text-gray-700">Ductilidade</summary>
            <div class="px-4 pb-4 space-y-2 text-xs text-gray-600">
                <pre class="whitespace-pre-wrap bg-slate-50 border rounded p-3">
xi = x/d = ${memNum(xi, 3)}
limite = 0.45
status = ${xi <= 0.45 ? 'OK' : 'ALERTA'}
                </pre>
            </div>
        </details>
    `;

    const crackHtml = `
        <details class="border rounded-lg bg-white">
            <summary class="cursor-pointer px-4 py-2 text-sm font-semibold text-gray-700">Fissuracao (ELS-FREQ)</summary>
            <div class="px-4 pb-4 space-y-2 text-xs text-gray-600">
                <pre class="whitespace-pre-wrap bg-slate-50 border rounded p-3">
M_freq = max(|M_els_freq_max|, |M_els_freq_min|) = ${memUnit(M_freq, 'kN.m')}
Mr = alpha*fctm*Ic/yt = ${memUnit(serviceVerifier.Mr, 'kN.m')}
alpha_e = Es/Ecs = ${memNum(serviceVerifier.alpha_e, 3)}
sigma_si = alpha_e * M * (d - x_II) / I_II = ${memUnit(sigma_si, 'MPa')}
Acri = bw * min(2.5*(h-d), h/2) = ${memUnit(Acri, 'cm2')}
rho_ri = As / Acri = ${memNum(rho_ri, 4)}
w1 = (phi/(12.5*eta1))*(sigma/E_s)*(3*sigma/fctm) = ${memUnit(wk1, 'mm')}
w2 = (phi/(12.5*eta1))*(sigma/E_s)*(4/rho_ri + 45) = ${memUnit(wk2, 'mm')}
wk = min(w1, w2) = ${memUnit(wk, 'mm')}
limite = ${memUnit(inputs.wkLim, 'mm')}
status = ${wk <= inputs.wkLim ? 'OK' : 'ALERTA'}
                </pre>
            </div>
        </details>
    `;

    return `
        <details class="border rounded-lg bg-white">
            <summary class="cursor-pointer px-4 py-3 font-semibold text-gray-800">${section.name} | x = ${memNum(section.x, 2)} m</summary>
            <div class="px-4 pb-4 space-y-4">
                ${inputsHtml}
                ${combosHtml}
                ${flexHtml}
                ${shearHtml}
                ${fatigueSteelHtml}
                ${minMaxHtml}
                ${fatigueConcHtml}
                ${ductilityHtml}
                ${crackHtml}
            </div>
        </details>
    `;
}

function updateMemoriaCalculo(sections = null) {
    const container = document.getElementById('memoria-content');
    if (!container) return;

    if (!loadProcessor) {
        container.innerHTML = '<div class="text-sm text-gray-500">Clique em CALCULAR para gerar a memoria.</div>';
        return;
    }

    const items = sections || loadProcessor.findCriticalSections();
    if (!items.length) {
        container.innerHTML = '<div class="text-sm text-gray-500">Sem secoes criticas disponiveis.</div>';
        return;
    }

    const inputs = getDetailInputs();
    const fck = getNumericValue('inp-fck', 30);
    const materials = new SectionMaterials(fck, inputs.fykLong);

    const deflectionHtml = buildMemoriaDeflection(inputs, materials);
    const sectionsHtml = items.map((section) => buildSectionMemory(section, inputs, materials)).join('');

    container.innerHTML = `${deflectionHtml}${sectionsHtml}`;
}

function renderDetailSectionList() {
    const container = document.getElementById('detail-section-list');
    if (!container) return;

    if (!detailSections.length) {
        container.innerHTML = `
            <div class="text-gray-400 text-center py-6 col-span-full">
                Clique em "CALCULAR" para gerar as seções críticas
            </div>
        `;
        return;
    }

    const html = detailSections.map((section) => {
        const isActive = section.id === selectedDetailSectionId;
        const activeClass = isActive ? 'border-primary bg-blue-50 text-primary' : 'border-gray-200 bg-white text-gray-700';
        return `
            <button data-section-id="${section.id}" class="detail-section-btn border rounded-lg p-3 text-left transition-colors ${activeClass}">
                <div class="text-sm font-semibold">${section.name}</div>
                <div class="text-xs text-gray-500">x = ${section.x.toFixed(1)} m</div>
            </button>
        `;
    }).join('');

    container.innerHTML = html;
    container.querySelectorAll('.detail-section-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedDetailSectionId = btn.dataset.sectionId;
            renderDetailSectionList();
            updateDetailView();
        });
    });
}

function createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => {
        el.setAttribute(key, String(value));
    });
    return el;
}

function computeLayerCounts(nBars, layers, innerWidth, minCenterSpacing) {
    const counts = new Array(layers).fill(0);
    if (layers <= 0 || nBars <= 0) {
        return { counts, maxPerLayer: 0, capacity: 0 };
    }
    const spacing = minCenterSpacing > 0 ? minCenterSpacing : 0;
    const maxPerLayer = innerWidth > 0
        ? Math.max(1, Math.floor(innerWidth / (spacing || 1)) + 1)
        : 0;
    let remaining = nBars;
    for (let i = 0; i < layers; i++) {
        if (remaining <= 0) break;
        if (i < layers - 1 && maxPerLayer > 0) {
            counts[i] = Math.min(remaining, maxPerLayer);
        } else {
            counts[i] = remaining;
        }
        remaining -= counts[i];
    }
    return { counts, maxPerLayer, capacity: maxPerLayer * layers, remaining };
}

function computeLayerPositions(count, bw, barOffset, innerWidth) {
    if (count <= 0) return [];
    if (count === 1) return [bw / 2];
    if (innerWidth <= 0) return [bw / 2];
    const positions = [];
    const xStart = barOffset;
    const xEnd = bw - barOffset;
    const spacing = (xEnd - xStart) / (count - 1);
    for (let i = 0; i < count; i++) {
        positions.push(xStart + i * spacing);
    }
    return positions;
}

function alignLayerPositions(count, basePositions, bw, barOffset, innerWidth) {
    if (count <= 0) return [];
    if (!basePositions || basePositions.length === 0) {
        return computeLayerPositions(count, bw, barOffset, innerWidth);
    }
    if (count === 1) {
        const idx = Math.floor(basePositions.length / 2);
        return [basePositions[idx]];
    }
    const maxIndex = basePositions.length - 1;
    const positions = [];
    for (let i = 0; i < count; i++) {
        const idx = Math.round((i * maxIndex) / (count - 1));
        positions.push(basePositions[idx]);
    }
    return positions;
}

function renderSectionSvg(inputs) {
    const svg = document.getElementById('section-svg');
    if (!svg) return;

    const {
        bw,
        h,
        cover,
        barPhi,
        barPhiComp,
        stirrPhi,
        layers,
        nBars,
        nBarsComp,
        clearSpacing,
        momentPositive,
        neutralAxis
    } = inputs;
    const viewW = 420;
    const viewH = 300;
    const margin = 18;

    svg.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`);
    svg.innerHTML = '';

    if (bw <= 0 || h <= 0) {
        return;
    }

    const scale = Math.min((viewW - 2 * margin) / bw, (viewH - 2 * margin) / h);
    const offsetX = (viewW - bw * scale) / 2;
    const offsetY = (viewH - h * scale) / 2;

    const toX = x => offsetX + x * scale;
    const toY = y => offsetY + y * scale;

    const barDia = barPhi / 10;
    const barDiaComp = barPhiComp / 10;
    const stirrDia = stirrPhi / 10;
    const stirrOffset = cover + stirrDia / 2;
    const barOffset = cover + stirrDia + barDia / 2;
    const barOffsetComp = cover + stirrDia + barDiaComp / 2;

    const outerRect = createSvgElement('rect', {
        x: toX(0),
        y: toY(0),
        width: bw * scale,
        height: h * scale,
        fill: '#f8fafc',
        stroke: '#94a3b8',
        'stroke-width': 2
    });
    svg.appendChild(outerRect);

    const stirrWidth = bw - 2 * stirrOffset;
    const stirrHeight = h - 2 * stirrOffset;
    if (stirrWidth > 0 && stirrHeight > 0) {
        const stirrStroke = Math.max(1, Math.min(4, stirrDia * scale));
        const stirrRect = createSvgElement('rect', {
            x: toX(stirrOffset),
            y: toY(stirrOffset),
            width: stirrWidth * scale,
            height: stirrHeight * scale,
            fill: 'none',
            stroke: '#2563eb',
            'stroke-width': stirrStroke
        });
        svg.appendChild(stirrRect);
    }

    const innerWidth = bw - 2 * barOffset;
    const innerWidthComp = bw - 2 * barOffsetComp;
    const yBottom = h - barOffset;
    const yTop = barOffset;
    const availableHeight = Math.max(0, yBottom - yTop);
    const minCenterSpacing = barDia + (Number.isFinite(clearSpacing) ? clearSpacing : 2.5);
    let layerSpacing = layers > 1 ? minCenterSpacing : 0;
    if (layers > 1 && availableHeight > 0 && layerSpacing > availableHeight / (layers - 1)) {
        layerSpacing = availableHeight / (layers - 1);
    }
    const startY = momentPositive === false ? yTop : yBottom;
    const layerDirection = momentPositive === false ? 1 : -1;
    const { counts } = computeLayerCounts(nBars, layers, innerWidth, minCenterSpacing);
    const barRadius = Math.max(1.5, (barDia / 2) * scale);

    for (let layer = 0; layer < layers; layer++) {
        const count = counts[layer];
        if (count <= 0) continue;
        const y = layers > 1 ? startY + layer * layerSpacing * layerDirection : startY;

        const positions = computeLayerPositions(count, bw, barOffset, innerWidth);

        positions.forEach((posX) => {
            const cx = toX(posX);
            const cy = toY(y);
            svg.appendChild(createSvgElement('circle', {
                cx,
                cy,
                r: barRadius,
                fill: '#f97316',
                stroke: '#c2410c',
                'stroke-width': 1
            }));
        });
    }

    if (nBarsComp > 0) {
        const minCenterSpacingComp = barDiaComp + (Number.isFinite(clearSpacing) ? clearSpacing : 2.5);
        const yTopComp = barOffsetComp;
        const yBottomComp = h - barOffsetComp;
        const availableHeightComp = Math.max(0, yBottomComp - yTopComp);
        let layerSpacingComp = layers > 1 ? minCenterSpacingComp : 0;
        if (layers > 1 && availableHeightComp > 0 && layerSpacingComp > availableHeightComp / (layers - 1)) {
            layerSpacingComp = availableHeightComp / (layers - 1);
        }

        const startYComp = momentPositive === false ? yBottomComp : yTopComp;
        const layerDirectionComp = momentPositive === false ? -1 : 1;
        const { counts: compCounts } = computeLayerCounts(nBarsComp, layers, innerWidthComp, minCenterSpacingComp);
        const barRadiusComp = Math.max(1.5, (barDiaComp / 2) * scale);

        for (let layer = 0; layer < layers; layer++) {
            const count = compCounts[layer];
            if (count <= 0) continue;
            const y = layers > 1 ? startYComp + layer * layerSpacingComp * layerDirectionComp : startYComp;
            const positions = computeLayerPositions(count, bw, barOffsetComp, innerWidthComp);

            positions.forEach((posX) => {
                const cx = toX(posX);
                const cy = toY(y);
                svg.appendChild(createSvgElement('circle', {
                    cx,
                    cy,
                    r: barRadiusComp,
                    fill: '#14b8a6',
                    stroke: '#0f766e',
                    'stroke-width': 1
                }));
            });
        }
    }

    if (Number.isFinite(neutralAxis) && neutralAxis > 0) {
        const axisFromTop = momentPositive === false ? (h - neutralAxis) : neutralAxis;
        const axisY = toY(axisFromTop);
        const axisLine = createSvgElement('line', {
            x1: toX(0),
            y1: axisY,
            x2: toX(bw),
            y2: axisY,
            stroke: '#0f172a',
            'stroke-width': 1,
            'stroke-dasharray': '4 3'
        });
        svg.appendChild(axisLine);
        const axisLabel = createSvgElement('text', {
            x: toX(bw) - 6,
            y: axisY - 6,
            'text-anchor': 'end',
            'font-size': 10,
            fill: '#0f172a'
        });
        axisLabel.textContent = 'Linha neutra';
        svg.appendChild(axisLabel);
    }

    const infoText = createSvgElement('text', {
        x: 12,
        y: 18,
        'font-size': 11,
        fill: '#475569'
    });
    const infoLines = [
        `BW = ${bw} cm`,
        `H = ${h} cm`,
        `Cobrimento = ${cover} cm`
    ];
    infoLines.forEach((line, index) => {
        const tspan = createSvgElement('tspan', {
            x: 12,
            y: 18 + index * 14
        });
        tspan.textContent = line;
        infoText.appendChild(tspan);
    });
    svg.appendChild(infoText);
}

function buildDetailWarnings(inputs) {
    const warnings = [];
    const barDia = inputs.barPhi / 10;
    const stirrDia = inputs.stirrPhi / 10;
    const barOffset = inputs.cover + stirrDia + barDia / 2;
    const innerWidth = inputs.bw - 2 * barOffset;
    const innerHeight = inputs.h - 2 * barOffset;
    const minCenterSpacing = barDia + inputs.clearSpacing;

    if (innerWidth <= 0 || innerHeight <= 0) {
        warnings.push('Cobrimento, estribo ou bitola inviabilizam a seção útil.');
    }

    if (inputs.layers > inputs.nBars) {
        warnings.push('Número de camadas maior que o número de barras.');
    }

    if (inputs.layers > 1) {
        const requiredHeight = (inputs.layers - 1) * minCenterSpacing;
        if (innerHeight < requiredHeight) {
            warnings.push('Espaçamento vertical menor que o mínimo entre camadas.');
        }
    }

    const { counts, capacity } = computeLayerCounts(inputs.nBars, inputs.layers, innerWidth, minCenterSpacing);
    if (capacity > 0 && inputs.nBars > capacity) {
        warnings.push('Número de barras excede a capacidade por camada com o espaçamento mínimo.');
    }
    counts.forEach((count, idx) => {
        if (count > 1) {
            const requiredWidth = (count - 1) * minCenterSpacing;
            if (innerWidth < requiredWidth) {
                warnings.push(`Espaçamento horizontal menor que o mínimo na camada ${idx + 1}.`);
            }
        }
    });

    if (inputs.fykStirr >= 600 && inputs.stirrPhi >= 10) {
        warnings.push('Estribo CA-60 com diâmetro >= 10 mm pode estar fora de norma.');
    }

    return warnings;
}

function renderDetailWarnings(warnings) {
    const list = document.getElementById('detail-warnings');
    if (!list) return;
    if (!warnings.length) {
        list.className = 'text-xs text-gray-500 mt-2 space-y-1';
        list.innerHTML = '<li>Sem avisos no detalhamento.</li>';
        return;
    }
    list.className = 'text-xs text-orange-600 mt-2 space-y-1';
    list.innerHTML = warnings.map(item => `<li>- ${item}</li>`).join('');
}

function updateDetailView() {
    const section = getSelectedDetailSection();
    const inputs = getDetailInputs();
    const momentInfo = getMomentInfo(section);
    const domainData = section ? computeDomainData(inputs, momentInfo.abs, momentInfo.isPositive) : null;
    const header = document.getElementById('detail-section-info');
    const label = document.getElementById('detail-section-label');

    if (section && header) {
        header.textContent = `${section.name} | x=${section.x.toFixed(1)} m | Momento ${momentInfo.sign}: ${momentInfo.moment.toFixed(1)} kN.m | V=${section.V_max.toFixed(1)}/${section.V_min.toFixed(1)} kN`;
    } else if (header) {
        header.textContent = '';
    }

    if (section && label) {
        label.textContent = `x=${section.x.toFixed(1)} m | Momento ${momentInfo.sign}`;
    } else if (label) {
        label.textContent = '';
    }

    renderSectionSvg({
        ...inputs,
        momentPositive: momentInfo.isPositive,
        neutralAxis: domainData ? domainData.x : null
    });
    renderDetailWarnings(buildDetailWarnings(inputs));
    renderDomainPanel(section, momentInfo, domainData);
}

function refreshDetailSections(sections = null) {
    detailSections = sections || (loadProcessor ? loadProcessor.findCriticalSections() : []);
    if (!detailSections.length) {
        selectedDetailSectionId = null;
    } else if (!selectedDetailSectionId || !detailSections.find(section => section.id === selectedDetailSectionId)) {
        selectedDetailSectionId = detailSections[0].id;
    }
    renderDetailSectionList();
    updateDetailView();
}

function syncDuplicateInputs(ids) {
    ids.forEach((id) => {
        const elements = getInputElements(id);
        if (elements.length < 2) return;
        elements.forEach((el) => {
            const sync = () => {
                elements.forEach((other) => {
                    if (other !== el && other.value !== el.value) {
                        other.value = el.value;
                    }
                });
            };
            el.addEventListener('input', sync);
            el.addEventListener('change', sync);
        });
    });
}

function setupDetailInputs() {
    const ids = [
        'inp-bw',
        'inp-h',
        'inp-cover',
        'inp-fck',
        'inp-nbars',
        'inp-phi',
        'inp-layers',
        'inp-clear-spacing',
        'inp-stirr-phi',
        'inp-stirr-s',
        'inp-fyk-long',
        'inp-fyk-stirr',
        'inp-nbars-comp',
        'inp-phi-comp',
        'inp-caa',
        'inp-wk-lim'
    ];
    ids.forEach((id) => {
        const elements = getInputElements(id);
        if (!elements.length) return;
        elements.forEach((el) => {
            el.addEventListener('input', updateDetailView);
            el.addEventListener('change', updateDetailView);
        });
    });
    syncDuplicateInputs(['inp-stirr-phi', 'inp-stirr-s']);
    updateDetailView();
}

function setupDomainImageFallback() {
    const img = document.getElementById('domain-image');
    if (!img) return;
    img.addEventListener('error', () => {
        const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
<rect width="640" height="360" fill="#f8fafc"/>
<rect x="24" y="24" width="592" height="312" fill="#ffffff" stroke="#e2e8f0"/>
<text x="320" y="170" font-family="Arial, sans-serif" font-size="18" text-anchor="middle" fill="#475569">Adicionar imagem</text>
<text x="320" y="198" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="#64748b">app/assets/dominio-nbr.png</text>
</svg>`;
        img.src = `data:image/svg+xml;utf8,${encodeURIComponent(fallbackSvg)}`;
    }, { once: true });
}

function updateLayoutMetrics() {
    const header = document.getElementById('app-header');
    const footer = document.getElementById('app-footer');
    const root = document.documentElement;
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
    root.style.setProperty('--app-header-height', `${Math.round(headerHeight)}px`);
    root.style.setProperty('--app-footer-height', `${Math.round(footerHeight)}px`);
}

function setupTabs() {
    const buttons = Array.from(document.querySelectorAll('.tab-btn'));
    const panels = Array.from(document.querySelectorAll('.tab-panel'));
    if (!buttons.length || !panels.length) {
        return;
    }

    const activateTab = (tabId) => {
        buttons.forEach((btn) => {
            const isActive = btn.dataset.tab === tabId;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        panels.forEach((panel) => {
            panel.classList.toggle('active', panel.id === `tab-${tabId}`);
        });
    };

    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.dataset.tab) {
                activateTab(btn.dataset.tab);
            }
        });
    });

    const initial = buttons.find((btn) => btn.classList.contains('active')) || buttons[0];
    if (initial && initial.dataset.tab) {
        activateTab(initial.dataset.tab);
    }
}

function setupResizers() {
    const root = document.documentElement;
    const layout = document.querySelector('.app-layout');
    const sidebarResizer = document.getElementById('resizer-sidebar');
    const overviewResizer = document.getElementById('resizer-overview');
    const overviewSplit = document.getElementById('overview-split');

    if (sidebarResizer && layout) {
        sidebarResizer.addEventListener('mousedown', (event) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = parseFloat(getComputedStyle(root).getPropertyValue('--sidebar-width')) || 320;

            const onMouseMove = (e) => {
                const layoutRect = layout.getBoundingClientRect();
                const minWidth = 240;
                const maxWidth = Math.min(520, layoutRect.width - 280);
                let nextWidth = startWidth + (e.clientX - startX);
                nextWidth = Math.max(minWidth, Math.min(maxWidth, nextWidth));
                root.style.setProperty('--sidebar-width', `${Math.round(nextWidth)}px`);
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
    }

    if (overviewResizer && overviewSplit) {
        overviewResizer.addEventListener('mousedown', (event) => {
            event.preventDefault();
            const onMouseMove = (e) => {
                const rect = overviewSplit.getBoundingClientRect();
                const minRatio = 0.35;
                const maxRatio = 0.75;
                const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
                const clamped = Math.max(minRatio, Math.min(maxRatio, ratio));
                root.style.setProperty('--overview-top-height', `${Math.round(clamped * 100)}%`);
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateLayoutMetrics();
    syncImpactInputs();
    setupImpactInputs();
    setupServiceInputs();
    initCharts();
    initDeflectionChart();
    setupExcelUpload();
    setupTabs();
    setupChartTabs();
    setupResizers();
    setupDetailInputs();
    setupDomainImageFallback();
    document.getElementById('btn-calculate').addEventListener('click', runCalculation);
    runCalculation();
    window.addEventListener('resize', updateLayoutMetrics);
});

