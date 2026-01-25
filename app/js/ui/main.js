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

    const showDeflection = loadCase === 'ELS_QP';

    // Gerar botões dinamicamente
    let buttonsHtml = `
        <button class="px-3 py-1 text-xs font-medium rounded-md bg-white shadow-sm text-gray-800 transition-all chart-toggle active" data-target="shear">Cortantes</button>
        <button class="px-3 py-1 text-xs font-medium rounded-md text-gray-600 hover:bg-white hover:shadow-sm transition-all chart-toggle" data-target="moment">Momentos</button>
    `;

    if (showDeflection) {
        buttonsHtml += `
            <button class="px-3 py-1 text-xs font-medium rounded-md text-gray-600 hover:bg-white hover:shadow-sm transition-all chart-toggle" data-target="deflection">Flecha</button>
        `;
    }

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

    // Se não está em Flecha QP mas estava mostrando deflection, voltar para shear
    if (!showDeflection && currentChartTarget === 'deflection') {
        currentChartTarget = 'shear';
        // Mostrar container de shear
        Object.values(chartContainers).forEach(c => {
            if (c) {
                c.classList.add('opacity-0', 'pointer-events-none', 'z-0');
                c.classList.remove('z-10');
            }
        });
        if (chartContainers['shear']) {
            chartContainers['shear'].classList.remove('opacity-0', 'pointer-events-none', 'z-0');
            chartContainers['shear'].classList.add('z-10');
        }
        if (chartTitle) chartTitle.innerText = 'Cortantes (kN)';
    }

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
        infoDiv.innerHTML = '<p class="text-gray-500 text-sm">Clique em CALCULAR para ver a verificação de flecha.</p>';
        infoDiv.classList.remove('hidden');
        return;
    }

    const inputs = getDetailInputs();
    const fck = getNumericValue('inp-fck', 30);
    const d = computeEffectiveDepth(inputs);
    const AsProv = computeAsProvided(inputs);
    const frames = loadProcessor.frames || [];
    const totalLength = loadProcessor.totalLength || 0;

    if (!frames.length) {
        infoDiv.innerHTML = '<p class="text-gray-500 text-sm">Dados de vãos não disponíveis.</p>';
        infoDiv.classList.remove('hidden');
        return;
    }

    // Calcular flecha por vão
    let html = `
        <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Verificação ELS-DEF (Flecha)
        </h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    `;

    let allOk = true;
    frames.forEach((frame, idx) => {
        const L = frame.end - frame.start;
        const limitCm = (L * 100) / 250; // L/250 em cm

        // Obter flecha máxima do vão (simplificado - usar dados do gráfico)
        const dataFlecha = loadProcessor.getLoadCaseData('ELS_QP');
        let maxDeflection = 0;

        if (dataFlecha && dataFlecha.deflection) {
            const stations = dataFlecha.stations || [];
            const deflections = dataFlecha.deflection || [];
            for (let i = 0; i < stations.length; i++) {
                if (stations[i] >= frame.start && stations[i] <= frame.end) {
                    maxDeflection = Math.max(maxDeflection, Math.abs(deflections[i] || 0));
                }
            }
        }

        const utilization = (maxDeflection / limitCm) * 100;
        const isOk = maxDeflection <= limitCm;
        if (!isOk) allOk = false;

        const bgColor = isOk ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200';
        const textColor = isOk ? 'text-emerald-700' : 'text-amber-700';
        const badge = isOk
            ? '<span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500 text-white">OK</span>'
            : '<span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500 text-white">ALERTA</span>';

        html += `
            <div class="p-3 rounded-lg border ${bgColor}">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium text-gray-600">Vão ${idx + 1}</span>
                    ${badge}
                </div>
                <div class="text-xs text-gray-500">L = ${L.toFixed(2)} m</div>
                <div class="mt-2 flex justify-between items-center">
                    <span class="text-xs text-gray-500">δ<sub>max</sub></span>
                    <span class="text-sm font-semibold ${textColor}">${maxDeflection.toFixed(2)} cm</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-500">δ<sub>lim</sub> (L/250)</span>
                    <span class="text-sm text-gray-600">${limitCm.toFixed(2)} cm</span>
                </div>
                <div class="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div class="h-full ${isOk ? 'bg-emerald-500' : 'bg-amber-500'}" style="width: ${Math.min(utilization, 100)}%"></div>
                </div>
                <div class="text-right text-[10px] text-gray-500 mt-1">${utilization.toFixed(0)}%</div>
            </div>
        `;
    });

    html += '</div>';

    // Resumo geral
    const summaryBg = allOk ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
    const summaryIcon = allOk ? '✓' : '⚠';
    html += `
        <div class="mt-3 p-2 rounded ${summaryBg} text-sm font-medium text-center">
            ${summaryIcon} ${allOk ? 'Todos os vãos atendem ao limite L/250' : 'Alguns vãos ultrapassam o limite L/250'}
        </div>
    `;

    infoDiv.innerHTML = html;
    infoDiv.classList.remove('hidden');
}

/**
 * Oculta o painel de informações ELS-DEF
 */
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

function updateDeflectionChart() {
    if (!loadProcessor) return;
    if (!deflectionChart) {
        initDeflectionChart();
    }
    if (!deflectionChart) return;
    try {
        const elsData = loadProcessor.getLoadCaseData('ELS_QP');
        // Se nao tiver ELS_QP, tentar usar DEAD como fallback seguro pra nao dar erro, mas idealmente deve ter ELS_QP
        const dataToUse = (elsData && elsData.stations) ? elsData : loadProcessor.getLoadCaseData('DEAD');

        if (!dataToUse || !dataToUse.stations) return;

        // Calcular flecha
        const inputs = getDetailInputs();
        const bw = inputs.bw;
        const h = inputs.h;
        const fck = getNumericValue('inp-fck', 30);
        const fyk = inputs.fykLong;
        const d = computeEffectiveDepth(inputs);
        const As = computeAsProvided(inputs);
        const phi = inputs.barPhi;
        const dLinha = inputs.cover + (inputs.stirrPhi / 10) + (phi / 10) / 2;

        const elsVerifier = new ServiceabilityVerifier({ bw, h, d }, { fck, fyk }, As, { phi, d_linha: dLinha });

        // Momentos para flecha (ELS-QP)
        const momentsQp = buildMomentSeries(dataToUse);
        if (!momentsQp.length) return;

        const result = buildDeflectionBySpans(
            elsVerifier,
            momentsQp,
            loadProcessor.frames,
            loadProcessor.totalLength
        );

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
            return 'ELU = 1.4*(G + Trilho) + 1.4*(Q*CIV*CIA*CNF)';
        case 'FADIGA':
            return 'Fadiga = 1.0*(G + Trilho) + 1.0*(Q*CIV*CIA*CNF)';
        case 'ELS_QP':
            return 'ELS-QP = 1.0*(G + Trilho) + 0.5*(Q*CIV*CIA*CNF)';
        case 'ELS_FREQ':
            return 'ELS-FREQ = 1.0*(G + Trilho) + 0.8*(Q*CIV*CIA*CNF)';
        default:
            return '';
    }
}

function updateChartFormula() {
    const subtitle = document.getElementById('chart-subtitle');
    if (!subtitle) return;
    const formulaCase = currentChartTarget === 'deflection' ? 'ELS_QP' : currentLoadCase;
    subtitle.textContent = getCombinationFormula(formulaCase);
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
    const Asw_s = computeStirrupAsw(inputs);
    const fatigueData = loadProcessor.getLoadCaseData('FADIGA');

    container.innerHTML = items.map((section) => {
        const momentAbs = Math.max(Math.abs(section.M_max || 0), Math.abs(section.M_min || 0));
        const bendingVerifier = new BendingVerifier(
            { bw: inputs.bw, h: inputs.h, d: d, c_nom: inputs.cover },
            { fck: fck, fyk: inputs.fykLong }
        );
        const flexResult = bendingVerifier.verifySection(momentAbs, AsProv);
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
        const asMinUtil = AsProv > 0 ? (As_min / AsProv) * 100 : 0;
        const asMinOk = AsProv >= As_min;

        // Passo 2: Armadura Máxima (NBR 6118 Item 17.3.5.2.4)
        const As_max = 0.04 * inputs.bw * inputs.h;
        const asMaxUtil = As_max > 0 ? (AsProv / As_max) * 100 : 0;
        const asMaxOk = AsProv <= As_max;

        // Passo 3: Fadiga do Concreto (NBR 6118 Item 23.5.4.1)
        const concFatigueResult = fatigueVerifier.verifyConcreteCompressionFatigue(fatigueMmax || 0);
        const concFatigueUtil = concFatigueResult.utilizacao || 0;
        const concFatigueOk = concFatigueResult.status === 'OK';

        // Passo 4: Ductilidade (NBR 6118 Item 14.6.4.3)
        const xi = flexResult.xi || 0;
        const xiUtil = (xi / 0.45) * 100;
        const xiOk = xi <= 0.45;

        // Passo 5: Fissuração ELS-W (NBR 6118 Item 13.4.2)
        const barDia = inputs.barPhi / 10;
        const stirrDia = inputs.stirrPhi / 10;
        const dLinha = inputs.cover + stirrDia + barDia / 2;
        const serviceVerifier = new ServiceabilityVerifier(
            { bw: inputs.bw, h: inputs.h, d: d },
            { fck: fck, fyk: inputs.fykLong },
            AsProv,
            { phi: inputs.barPhi, d_linha: dLinha }
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
    const layers = Math.max(1, parseInt(getNumericValue('inp-layers', 3), 10));
    const clearSpacing = getNumericValue('inp-clear-spacing', 2.5);
    const stirrPhi = getNumericValue('inp-stirr-phi', 8);
    const stirrSpacing = getNumericValue('inp-stirr-s', 15);
    const fykLong = getNumericValue('inp-fyk-long', 500);
    const fykStirr = getNumericValue('inp-fyk-stirr', 500);
    const fykLongLabel = getSelectLabel('inp-fyk-long', 'CA-50');
    const fykStirrLabel = getSelectLabel('inp-fyk-stirr', 'CA-50');
    const span = getNumericValue('inp-span', 12);
    const cia = getNumericValue('inp-cia', 1.25);
    const cnf = getNumericValue('inp-cnf', 1.0);
    const civ = computeCiv(span);

    return {
        bw,
        h,
        cover,
        nBars,
        barPhi,
        layers,
        clearSpacing,
        stirrPhi,
        stirrSpacing,
        fykLong,
        fykStirr,
        fykLongLabel,
        fykStirrLabel,
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

function computeDomainData(inputs, momentValue) {
    const fck = getNumericValue('inp-fck', 30);
    const barDia = inputs.barPhi / 10;
    const stirrDia = inputs.stirrPhi / 10;
    const d = inputs.h - inputs.cover - stirrDia - (barDia / 2);

    if (!Number.isFinite(momentValue) || momentValue <= 0 || d <= 0) {
        return null;
    }

    const geometry = { bw: inputs.bw, h: inputs.h, d: d, c_nom: inputs.cover };
    const materials = { fck: fck, fyk: inputs.fykLong };
    const verifier = new BendingVerifier(geometry, materials);
    const design = verifier.designReinforcement(momentValue);

    if (design.status === 'ERROR') {
        return { ...design, d, domain: 'N/A' };
    }

    const xi23 = 0.259;
    let domain = 'II';
    if (design.xi > xi23 && design.xi <= design.xi_lim) {
        domain = 'III';
    } else if (design.xi > design.xi_lim) {
        domain = 'IV';
    }

    return { ...design, d, domain, xi_23: xi23 };
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

    text.innerHTML = `
        <div class="text-sm font-semibold text-gray-800">Domínio ${domainLabel}</div>
        <div class="text-xs text-gray-500 mt-1">Momento crítico: ${momentInfo.moment.toFixed(1)} kN.m (${momentInfo.sign})</div>
        <div class="text-xs text-gray-500">Face comprimida: ${face}</div>
        ${x !== null ? `<div class="text-xs text-gray-500">Linha neutra: x = ${x.toFixed(2)} cm</div>` : ''}
        ${xi !== null ? `<div class="text-xs text-gray-500">x/d = ${xi.toFixed(3)}</div>` : ''}
        ${strainsHtml}
    `;
    updateDomainOverlay(domainData);
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
        stirrPhi,
        layers,
        nBars,
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
    const stirrDia = stirrPhi / 10;
    const stirrOffset = cover + stirrDia / 2;
    const barOffset = cover + stirrDia + barDia / 2;

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
    const baseCount = counts.find(count => count > 0) || 0;
    const basePositions = computeLayerPositions(baseCount, bw, barOffset, innerWidth);
    const barRadius = Math.max(1.5, (barDia / 2) * scale);

    for (let layer = 0; layer < layers; layer++) {
        const count = counts[layer];
        if (count <= 0) continue;
        const y = layers > 1 ? startY + layer * layerSpacing * layerDirection : startY;

        const positions = (count === baseCount && basePositions.length)
            ? basePositions
            : alignLayerPositions(count, basePositions, bw, barOffset, innerWidth);

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
    const domainData = section ? computeDomainData(inputs, momentInfo.abs) : null;
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
        'inp-fyk-stirr'
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

