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

// Instancias globais
let loadProcessor = null;
let momentChart = null;
let shearChart = null;
let currentLoadCase = 'ENV_MOVEL';
let detailSections = [];
let selectedDetailSectionId = null;

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
                legend: { position: 'top', labels: { boxWidth: 40, boxHeight: 12, filter: (legendItem, data) => { const dataset = data.datasets[legendItem.datasetIndex]; return dataset && dataset.label; } } },
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
                legend: { position: 'top', labels: { boxWidth: 40, boxHeight: 12, filter: (legendItem, data) => { const dataset = data.datasets[legendItem.datasetIndex]; return dataset && dataset.label; } } },
                tooltip: {
                    callbacks: {
                        label: ctx => `x=${ctx.parsed.x.toFixed(1)} m, ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} kN`
                    }
                }
            }
        }
    });
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

/**
 * Atualiza os graficos para um caso de carga
 */
function getCombinationFormula(loadCase) {
    if (loadCase === "ELU") {
        return "ELU = 1.4*(G + Trilho) + 1.4*Q";
    }
    if (loadCase === "FADIGA") {
        return "FADIGA = 1.0*(G + Trilho) + 0.5*Q";
    }
    return "";
}

function updateComboFormula(loadCase) {
    const text = getCombinationFormula(loadCase);
    const targets = [
        document.getElementById("combo-formula-moment"),
        document.getElementById("combo-formula-shear")
    ];
    for (const target of targets) {
        if (!target) continue;
        target.textContent = text;
        target.style.display = text ? "block" : "none";
    }
}

function updateChartTitles(isEnvelope) {
    const momentTitle = document.getElementById('chart-moment-title');
    const shearTitle = document.getElementById('chart-shear-title');
    if (!momentTitle || !shearTitle) {
        return;
    }
    const momentText = isEnvelope ? 'Envoltória de Momentos (kN.m)' : 'Diagrama de Momentos (kN.m)';
    const shearText = isEnvelope ? 'Envoltória de Cortantes (kN)' : 'Diagrama de Cortantes (kN)';
    momentTitle.textContent = momentText;
    shearTitle.textContent = shearText;
}
function updateCharts(loadCase) {
    const data = loadProcessor.getLoadCaseData(loadCase);
    updateComboFormula(loadCase);
    const stations = Array.isArray(data.stations) ? data.stations : [];

    const isEnvelope = data.M_max && data.M_max.length > 0;
    updateChartTitles(isEnvelope);

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
        momentChart.data.datasets[1].label = '';
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
        shearChart.data.datasets[1].label = '';
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
            updateCharts(currentLoadCase);
            updateCriticalSections();
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
function updateCriticalSections() {
    const bw = parseFloat(document.getElementById('inp-bw').value);
    const h = parseFloat(document.getElementById('inp-h').value);
    const cover = parseFloat(document.getElementById('inp-cover').value);
    const fck = parseFloat(document.getElementById('inp-fck').value);
    const fykLong = parseFloat(document.getElementById('inp-fyk-long').value);
    const fykStirr = parseFloat(document.getElementById('inp-fyk-stirr').value);
    const nBars = parseInt(document.getElementById('inp-nbars').value);
    const phi = parseFloat(document.getElementById('inp-phi').value);
    const stirrPhi = parseFloat(document.getElementById('inp-stirr-phi').value);

    const coverVal = Number.isFinite(cover) ? cover : 3;
    const barDia = Number.isFinite(phi) ? phi / 10 : 2;
    const stirrDia = Number.isFinite(stirrPhi) ? stirrPhi / 10 : 0.8;
    const d = h - coverVal - stirrDia - (barDia / 2);
    const As = nBars * Math.PI * (phi / 20) ** 2;

    const fykLongVal = Number.isFinite(fykLong) ? fykLong : 500;
    const fykStirrVal = Number.isFinite(fykStirr) ? fykStirr : 500;
    const geometry = { bw, h, d };
    const materials = { fck, fyk: fykLongVal, fywk: fykStirrVal };

    // Usar ELU para verificaÃ§Ãµes
    const criticalSections = loadProcessor.findCriticalSections();

    const sectionsContainer = document.getElementById('critical-sections');
    sectionsContainer.innerHTML = '';

    for (const section of criticalSections) {
        const results = [];

        const Md = Math.max(Math.abs(section.M_max), Math.abs(section.M_min));
        const Vd = Math.max(Math.abs(section.V_max), Math.abs(section.V_min));

        // Flexão
        const bendingVerifier = new BendingVerifier(geometry, materials);
        const bendingResult = bendingVerifier.verifySection(Md, As);
        results.push({
            name: 'Flexão ELU',
            status: bendingResult.status,
            utilizacao: bendingResult.utilizacao
        });

        // Cisalhamento
        const shearVerifier = new ShearVerifier(geometry, materials);
        const shearResult = shearVerifier.designStirrupsELU(Vd);
        results.push({
            name: 'Cisalhamento',
            status: shearResult.status,
            utilizacao: shearResult.ratioBiela
        });

        // Fadiga - usar dados de fadiga
        const fatigueData = loadProcessor.getLoadCaseData('FADIGA');
        const idx = fatigueData.stations.findIndex(x => Math.abs(x - section.x) < 0.1);
        if (idx >= 0) {
            const fatigueVerifier = new FatigueVerifier(geometry, materials, As, phi);
            const fatigueResult = fatigueVerifier.verifySteelFatigue(
                fatigueData.M_max[idx],
                fatigueData.M_min[idx]
            );
            results.push({
                name: 'Fadiga Aço',
                status: fatigueResult.status,
                utilizacao: fatigueResult.utilizacao
            });
        }

        sectionsContainer.innerHTML += createSectionCard(section, results);
    }
}

/**
 * Executa o cÃ¡lculo completo
 */
function runCalculation() {
    if (!loadProcessor) {
        loadProcessor = new LoadProcessor();
    }
    loadProcessor.processGlobalGeometry();

    // Renderizar filtros
    renderLoadCaseFilters();

    // Atualizar grÃ¡ficos com caso atual
    updateCharts(currentLoadCase);

    // Info da viga
    const infoBeam = document.getElementById('info-beam');
    const summary = loadProcessor.getSummary();
    const As = parseInt(document.getElementById('inp-nbars').value) *
        Math.PI * (parseFloat(document.getElementById('inp-phi').value) / 20) ** 2;

    infoBeam.innerHTML = `
        <strong>Viga Contínua:</strong> ${summary.totalLength}m<br>
        <strong>Frames:</strong> ${summary.numFrames}<br>
        <strong>As provida:</strong> ${As.toFixed(2)} cmÂ²
    `;
    infoBeam.classList.remove('hidden');

    // Atualizar seÃ§Ãµes crÃ­ticas
    updateCriticalSections();

    // Mostrar resumo
    document.getElementById('summary-panel').classList.remove('hidden');
    const summaryPlaceholder = document.getElementById('summary-placeholder');
    if (summaryPlaceholder) {
        summaryPlaceholder.classList.add('hidden');
    }
    updateSummary();
    refreshDetailSections();
}

/**
 * Atualiza o painel de resumo
 */
function updateSummary() {
    const data = loadProcessor.getLoadCaseData('ELU');
    const summaryContent = document.getElementById('summary-content');

    const M_max = Math.max(...data.M_max);
    const M_min = Math.min(...data.M_min);
    const V_max = Math.max(...data.V_max.map(Math.abs), ...data.V_min.map(Math.abs));

    summaryContent.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="text-center p-3 bg-blue-50 rounded-lg">
                <p class="text-2xl font-bold text-blue-700">${loadProcessor.totalLength}m</p>
                <p class="text-xs text-gray-500">Comprimento Total</p>
            </div>
            <div class="text-center p-3 bg-green-50 rounded-lg">
                <p class="text-2xl font-bold text-green-700">${M_max.toFixed(0)}</p>
                <p class="text-xs text-gray-500">M_max ELU (kN.m)</p>
            </div>
            <div class="text-center p-3 bg-red-50 rounded-lg">
                <p class="text-2xl font-bold text-red-700">${M_min.toFixed(0)}</p>
                <p class="text-xs text-gray-500">M_min ELU (kN.m)</p>
            </div>
            <div class="text-center p-3 bg-orange-50 rounded-lg">
                <p class="text-2xl font-bold text-orange-700">${V_max.toFixed(0)}</p>
                <p class="text-xs text-gray-500">V_max ELU (kN)</p>
            </div>
        </div>
    `;
}

/**
 * Detalhamento e layout
 */
function getNumericValue(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const val = parseFloat(el.value);
    return Number.isFinite(val) ? val : fallback;
}

function getSelectLabel(id, fallback) {
    const el = document.getElementById(id);
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
        fykStirrLabel
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

    return { ...design, d, domain };
}

function updateDomainOverlay(domainData) {
    const line = document.getElementById('domain-line');
    if (!line) return;

    if (!domainData || !Number.isFinite(domainData.xi)) {
        line.setAttribute('opacity', '0');
        return;
    }

    const xiLim = domainData.xi_lim || 0.45;
    const ratio = Math.max(0, Math.min(1, domainData.xi / xiLim));
    const startX = 10;
    const startY = 90;
    const endX = 10 + 80 * ratio;
    const endY = 10;

    line.setAttribute('x1', startX);
    line.setAttribute('y1', startY);
    line.setAttribute('x2', endX);
    line.setAttribute('y2', endY);
    line.setAttribute('opacity', '1');
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
    const x = domainData && Number.isFinite(domainData.x) ? domainData.x : null;

    text.innerHTML = `
        <div class="text-sm font-semibold text-gray-800">Domínio ${domainLabel}</div>
        <div class="text-xs text-gray-500 mt-1">Momento crítico: ${momentInfo.moment.toFixed(1)} kN.m (${momentInfo.sign})</div>
        <div class="text-xs text-gray-500">Face comprimida: ${face}</div>
        ${x !== null ? `<div class="text-xs text-gray-500">Linha neutra: x = ${x.toFixed(2)} cm</div>` : ''}
        ${xi !== null ? `<div class="text-xs text-gray-500">x/d = ${xi.toFixed(3)}</div>` : ''}
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

function refreshDetailSections() {
    detailSections = loadProcessor ? loadProcessor.findCriticalSections() : [];
    if (!detailSections.length) {
        selectedDetailSectionId = null;
    } else if (!selectedDetailSectionId || !detailSections.find(section => section.id === selectedDetailSectionId)) {
        selectedDetailSectionId = detailSections[0].id;
    }
    renderDetailSectionList();
    updateDetailView();
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
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', updateDetailView);
        el.addEventListener('change', updateDetailView);
    });
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
    initCharts();
    setupExcelUpload();
    setupTabs();
    setupResizers();
    setupDetailInputs();
    setupDomainImageFallback();
    document.getElementById('btn-calculate').addEventListener('click', runCalculation);
    runCalculation();
    window.addEventListener('resize', updateLayoutMetrics);
});

