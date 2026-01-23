import { LoadProcessor } from '../core/loads.js';
import { BendingVerifier } from '../core/bending.js';
import { ShearVerifier } from '../core/shear.js';
import { FatigueVerifier } from '../core/fatigue.js';
import { ServiceabilityVerifier } from '../core/serviceability.js';

let loadProcessor = null;
let currentLoadCase = 'ELU';
let chartMoments = null;
let chartShear = null;
let detailSections = [];
let selectedDetailSectionId = null;

const ENVELOPE_CASES = new Set(['ENV_MOVEL', 'ELU', 'FADIGA']);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const CHART_COLORS = {
    momentMax: '#3b82f6',
    momentMin: '#ef4444',
    shearMax: '#22c55e',
    shearMin: '#f59e0b'
};

const CHART_FILLS = {
    moment: 'rgba(59, 130, 246, 0.18)',
    shear: 'rgba(34, 197, 94, 0.18)'
};

const parseNumber = (value) => {
    if (typeof value === 'number') return value;
    if (value === null || value === undefined) return NaN;
    const cleaned = String(value).replace(',', '.').trim();
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : NaN;
};

const roundStation = (value) => {
    if (!Number.isFinite(value)) return value;
    return Math.round(value * 10) / 10;
};

const formatNumber = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '0.0';

const buildPoints = (stations = [], values = []) => (
    stations.map((x, index) => ({ x, y: values[index] ?? 0 }))
);

function initCharts() {
    const momentCanvas = document.getElementById('chart-moments');
    const shearCanvas = document.getElementById('chart-shear');
    if (!momentCanvas || !shearCanvas) return;

    const baseOptions = (yTitle, reverseY = false) => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
            x: {
                type: 'linear',
                title: { display: true, text: 'Posição (m)' },
                grid: { color: '#e2e8f0' }
            },
            y: {
                reverse: reverseY,
                title: { display: true, text: yTitle },
                grid: { color: '#e2e8f0' }
            }
        },
        plugins: {
            legend: {
                display: true,
                labels: { usePointStyle: false, boxWidth: 40, boxHeight: 12 }
            },
            tooltip: { mode: 'nearest', intersect: false }
        }
    });

    chartMoments = new Chart(momentCanvas.getContext('2d'), {
        type: 'line',
        data: { datasets: [] },
        options: baseOptions('Momento (kN.m)', true)
    });

    chartShear = new Chart(shearCanvas.getContext('2d'), {
        type: 'line',
        data: { datasets: [] },
        options: baseOptions('Cortante (kN)', false)
    });
}

function updateCharts(loadCaseId = 'ELU') {
    if (!loadProcessor || !chartMoments || !chartShear) return;
    currentLoadCase = loadCaseId;

    const data = loadProcessor.getLoadCaseData(loadCaseId);
    if (!data) return;

    const isEnvelope = ENVELOPE_CASES.has(loadCaseId);

    // Update buttons style
    updateLoadCaseButtons(loadCaseId);

    // Update Titles
    const momentTitle = document.getElementById('chart-moment-title');
    const shearTitle = document.getElementById('chart-shear-title');
    if (momentTitle) momentTitle.textContent = `${isEnvelope ? 'Envoltória' : 'Diagrama'} de Momentos (kN.m)`;
    if (shearTitle) shearTitle.textContent = `${isEnvelope ? 'Envoltória' : 'Diagrama'} de Cortantes (kN)`;

    // Formulas
    const momentFormula = document.getElementById('combo-formula-moment');
    const shearFormula = document.getElementById('combo-formula-shear');
    let formulaText = '';
    if (loadCaseId === 'ELU') formulaText = 'ELU = 1,4*(G + Trilho) + 1,4*Q';
    else if (loadCaseId === 'FADIGA') formulaText = 'FADIGA = 1,0*(G + Trilho) + 0,5*Q';

    if (momentFormula) momentFormula.textContent = formulaText;
    if (shearFormula) shearFormula.textContent = formulaText;

    const commonOpts = {
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0,
        parsing: false
    };

    if (isEnvelope) {
        chartMoments.data.datasets = [
            {
                ...commonOpts,
                label: 'M. Mín',
                data: buildPoints(data.stations, data.M_min),
                borderColor: CHART_COLORS.momentMin,
                backgroundColor: CHART_FILLS.moment,
                fill: 'origin'
            },
            {
                ...commonOpts,
                label: 'M. Máx',
                data: buildPoints(data.stations, data.M_max),
                borderColor: CHART_COLORS.momentMax,
                backgroundColor: CHART_FILLS.moment,
                fill: 'origin'
            }
        ];

        chartShear.data.datasets = [
            {
                ...commonOpts,
                label: 'V. Mín',
                data: buildPoints(data.stations, data.V_min),
                borderColor: CHART_COLORS.shearMin,
                backgroundColor: CHART_FILLS.shear,
                fill: 'origin'
            },
            {
                ...commonOpts,
                label: 'V. Máx',
                data: buildPoints(data.stations, data.V_max),
                borderColor: CHART_COLORS.shearMax,
                backgroundColor: CHART_FILLS.shear,
                fill: 'origin'
            }
        ];
    } else {
        chartMoments.data.datasets = [{
            ...commonOpts,
            label: 'Momento',
            data: buildPoints(data.stations, data.M_values),
            borderColor: CHART_COLORS.momentMax,
            backgroundColor: CHART_FILLS.moment,
            fill: 'origin'
        }];

        chartShear.data.datasets = [{
            ...commonOpts,
            label: 'Cortante',
            data: buildPoints(data.stations, data.V_values),
            borderColor: CHART_COLORS.shearMax,
            backgroundColor: CHART_FILLS.shear,
            fill: 'origin'
        }];
    }

    chartMoments.update('none');
    chartShear.update('none');
}

function renderLoadCaseFilters() {
    const container = document.getElementById('load-case-filters');
    if (!container || !loadProcessor) return;

    const cases = loadProcessor.getAvailableLoadCases();

    // Create buttons with dynamic data attributes
    // Usando rounded-xl para vértices mais arredondados (chanfrados/suaves)
    container.innerHTML = cases.map(c => `
        <button class="custom-case-btn px-4 py-2 rounded-xl shadow-sm text-sm font-semibold transition-all mr-2 mb-2"
                data-case="${c.id}"
                data-color="${c.color}">
            ${c.label}
        </button>
    `).join('');

    // Add click listeners
    container.querySelectorAll('.custom-case-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            updateCharts(btn.dataset.case);
        });
    });

    // Initialize styles
    updateLoadCaseButtons(currentLoadCase);
}

function updateLoadCaseButtons(activeId) {
    document.querySelectorAll('.custom-case-btn').forEach(btn => {
        const id = btn.dataset.case;
        const color = btn.dataset.color || '#cbd5e1';
        const isActive = id === activeId;

        // Base styles ensuring override of any conflicting defaults
        btn.style.borderRadius = '12px'; // Força o arredondamento desejado

        if (isActive) {
            btn.style.backgroundColor = color;
            btn.style.color = '#ffffff';
            btn.style.border = 'none'; // Remove borda padrão se houver
            btn.style.borderLeft = `4px solid ${color}`; // Mantém consistência visual
            btn.classList.add('shadow-md');
            btn.classList.remove('bg-white', 'text-gray-700');
        } else {
            btn.style.backgroundColor = '#ffffff';
            btn.style.color = '#334155';
            btn.style.border = 'none';
            btn.style.borderLeft = `4px solid ${color}`;
            btn.classList.remove('shadow-md');
            btn.classList.add('bg-white', 'text-gray-700');
        }
    });
}

function buildFrameList(frameStats) {
    return Array.from(frameStats.entries()).map(([name, stat]) => ({
        name,
        startX: stat.min,
        endX: stat.max,
        length: roundStation(stat.max - stat.min)
    })).sort((a, b) => a.startX - b.startX);
}

function flattenSimpleCase(rows, frames) {
    const byFrame = new Map();
    rows.forEach((row) => {
        if (!byFrame.has(row.frame)) {
            byFrame.set(row.frame, []);
        }
        byFrame.get(row.frame).push({ x: row.x, V: row.V, M: row.M });
    });

    const order = frames.length
        ? frames.map((frame) => frame.name)
        : Array.from(byFrame.keys()).sort((a, b) => parseFloat(a) - parseFloat(b));

    const result = [];
    order.forEach((frameName) => {
        const items = byFrame.get(frameName);
        if (!items) return;
        items.sort((a, b) => a.x - b.x);
        result.push(...items);
    });
    return result;
}

function flattenEnvelopeCase(rows, frames) {
    const byFrame = new Map();
    rows.forEach((row) => {
        if (!byFrame.has(row.frame)) {
            byFrame.set(row.frame, new Map());
        }
        const frameMap = byFrame.get(row.frame);
        const key = row.x;
        const item = frameMap.get(key) || {
            x: row.x,
            V_max: -Infinity,
            V_min: Infinity,
            M_max: -Infinity,
            M_min: Infinity
        };
        item.V_max = Math.max(item.V_max, row.V);
        item.V_min = Math.min(item.V_min, row.V);
        item.M_max = Math.max(item.M_max, row.M);
        item.M_min = Math.min(item.M_min, row.M);
        frameMap.set(key, item);
    });

    const order = frames.length
        ? frames.map((frame) => frame.name)
        : Array.from(byFrame.keys()).sort((a, b) => parseFloat(a) - parseFloat(b));

    const result = [];
    order.forEach((frameName) => {
        const frameMap = byFrame.get(frameName);
        if (!frameMap) return;
        const items = Array.from(frameMap.values()).sort((a, b) => a.x - b.x);
        result.push(...items);
    });
    return result;
}

function parseExcelRows(rows) {
    if (!Array.isArray(rows)) {
        return null;
    }

    const validCases = new Set(['DEAD', 'TRILHO', 'ENV_MOVEL']);
    const normalized = [];
    const frameStats = new Map();

    rows.forEach((row) => {
        const outputCase = typeof row.OutputCase === 'string'
            ? row.OutputCase.trim()
            : row.OutputCase;
        if (!validCases.has(outputCase)) return;

        const frame = row.Frame !== undefined && row.Frame !== null ? String(row.Frame).trim() : '';
        if (!frame || frame.toLowerCase() === 'text') return;

        const station = roundStation(parseNumber(row.Station));
        const v = parseNumber(row.V2);
        const m = parseNumber(row.M3);
        if (!Number.isFinite(station) || !Number.isFinite(v) || !Number.isFinite(m)) {
            return;
        }

        normalized.push({ outputCase, frame, x: station, V: v, M: m });

        const stat = frameStats.get(frame) || { min: station, max: station };
        stat.min = Math.min(stat.min, station);
        stat.max = Math.max(stat.max, station);
        frameStats.set(frame, stat);
    });

    if (!normalized.length) {
        return null;
    }

    const frames = buildFrameList(frameStats);
    const totalLength = frames.length
        ? Math.max(...frames.map((frame) => frame.endX))
        : Math.max(...normalized.map((row) => row.x));

    const grouped = {
        DEAD: [],
        TRILHO: [],
        ENV_MOVEL: []
    };

    normalized.forEach((row) => {
        grouped[row.outputCase].push(row);
    });

    return {
        dead: flattenSimpleCase(grouped.DEAD, frames),
        trilho: flattenSimpleCase(grouped.TRILHO, frames),
        envMovel: flattenEnvelopeCase(grouped.ENV_MOVEL, frames),
        frames,
        totalLength
    };
}

async function parseExcelFile(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
        throw new Error('Planilha não encontrada.');
    }
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    const parsed = parseExcelRows(rows);
    if (!parsed) {
        throw new Error('Dados inválidos na planilha.');
    }
    return parsed;
}

function setupExcelUpload() {
    const input = document.getElementById('input-excel');
    const button = document.getElementById('btn-load-excel');
    const status = document.getElementById('excel-status');
    if (!input || !button || !status) return;

    const setStatus = (message, isError = false) => {
        status.textContent = message;
        status.classList.toggle('text-red-500', isError);
        status.classList.toggle('text-gray-500', !isError);
    };

    input.addEventListener('change', () => {
        if (input.files && input.files.length) {
            setStatus(`Arquivo selecionado: ${input.files[0].name}`);
        } else {
            setStatus('Sem arquivo carregado.');
        }
    });

    button.addEventListener('click', async () => {
        if (!input.files || !input.files.length) {
            setStatus('Selecione um arquivo .xlsx.', true);
            return;
        }
        try {
            setStatus('Lendo arquivo...');
            const data = await parseExcelFile(input.files[0]);
            if (!loadProcessor) {
                loadProcessor = new LoadProcessor();
            }
            loadProcessor.setCaseData(data);
            setStatus(`Arquivo carregado: ${input.files[0].name}`);
            runCalculation();
        } catch (error) {
            console.error(error);
            setStatus('Erro ao ler o arquivo Excel.', true);
        }
    });
}

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

function updateCriticalSections(sections = null) {
    const container = document.getElementById('critical-sections');
    if (!container || !loadProcessor) return;

    const items = sections || loadProcessor.findCriticalSections();
    if (!items.length) {
        container.innerHTML = `
            <div class="text-gray-400 text-center py-8 col-span-full">
                Clique em "CALCULAR" para gerar a análise
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

        const cardOk = flexOk && shearOk && fatigueOk;
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
                    ${buildUtilRow('Flexão ELU', flexUtil, flexOk)}
                    ${buildUtilRow('Cisalhamento', shearUtilMax, shearOk)}
                    ${buildUtilRow('Fadiga Aço', fatigueUtil, fatigueOk)}
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
 * Executa o cálculo completo
 */
function runCalculation() {
    if (!loadProcessor) {
        loadProcessor = new LoadProcessor();
    }
    loadProcessor.processGlobalGeometry();

    renderLoadCaseFilters();
    updateCharts(currentLoadCase);

    const infoBeam = document.getElementById('info-beam');
    const summary = loadProcessor.getSummary();
    const nBars = parseInt(document.getElementById('inp-nbars')?.value || '0', 10);
    const barPhi = parseFloat(document.getElementById('inp-phi')?.value || '0');
    const barDia = barPhi / 10;
    const As = nBars > 0 ? nBars * Math.PI * (barDia / 2) ** 2 : 0;

    if (infoBeam) {
        infoBeam.innerHTML = `
            <strong>Viga Contínua:</strong> ${summary.totalLength} m<br>
            <strong>Frames:</strong> ${summary.numFrames}<br>
            <strong>A<sub>s</sub> provida:</strong> ${As.toFixed(2)} cm<sup>2</sup>
        `;
        infoBeam.classList.remove('hidden');
    }

    const sections = loadProcessor.findCriticalSections();
    updateCriticalSections(sections);
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

    return { ...design, d, domain, xi_23: xi23 };
}

function computeDomainStrains(xi, xi23 = 0.259) {
    const eps_cu = 3.5;
    const eps_s_max = 10.0;

    if (!Number.isFinite(xi) || xi <= 0) {
        return null;
    }

    let eps_c = eps_cu;
    let eps_s = (eps_cu * (1 - xi)) / xi;
    if (xi <= xi23) {
        eps_s = eps_s_max;
        eps_c = (eps_s * xi) / (1 - xi);
    }

    const eps_c_clamped = Math.min(Math.max(eps_c, 0), eps_cu);
    const eps_s_clamped = Math.min(Math.max(eps_s, 0), eps_s_max);

    return {
        eps_c,
        eps_s,
        eps_c_clamped,
        eps_s_clamped,
        eps_cu,
        eps_s_max
    };
}

function updateDomainOverlay(domainData) {
    const line = document.getElementById('domain-line');
    if (!line) return;

    if (!domainData || !Number.isFinite(domainData.xi)) {
        line.setAttribute('opacity', '0');
        return;
    }

    // Calibrated for app/assets/dominio-nbr.png
    const map = {
        x_left: 5.45,
        x_zero: 67.3,
        x_ecu: 87.9,
        y_top: 17.9,
        y_bottom: 92.3
    };

    const xi = domainData.xi;
    const xi23 = Number.isFinite(domainData.xi_23) ? domainData.xi_23 : 0.259;
    const strains = computeDomainStrains(xi, xi23);
    if (!strains) {
        line.setAttribute('opacity', '0');
        return;
    }

    const {
        eps_cu,
        eps_s_max,
        eps_c_clamped,
        eps_s_clamped
    } = strains;

    const topX = map.x_zero + (eps_c_clamped / eps_cu) * (map.x_ecu - map.x_zero);
    const bottomX = map.x_zero - (eps_s_clamped / eps_s_max) * (map.x_zero - map.x_left);

    line.setAttribute('x1', bottomX);
    line.setAttribute('y1', map.y_bottom);
    line.setAttribute('x2', topX);
    line.setAttribute('y2', map.y_top);
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
    const strains = domainData ? computeDomainStrains(domainData.xi, domainData.xi_23) : null;
    const eps_s = strains ? strains.eps_s_clamped : null;
    const eps_c = strains ? strains.eps_c_clamped : null;

    text.innerHTML = `
        <div class="text-sm font-semibold text-gray-800">Domínio ${domainLabel}</div>
        <div class="text-xs text-gray-500 mt-1">Momento crítico: ${momentInfo.moment.toFixed(1)} kN.m (${momentInfo.sign})</div>
        <div class="text-xs text-gray-500">Face comprimida: ${face}</div>
        ${x !== null ? `<div class="text-xs text-gray-500">Linha neutra: x = ${x.toFixed(2)} cm</div>` : ''}
        ${xi !== null ? `<div class="text-xs text-gray-500">x/d = ${xi.toFixed(3)}</div>` : ''}
        ${eps_s !== null ? `<div class="text-xs text-gray-500">eps_s (aco): ${eps_s.toFixed(3)} permil</div>` : ''}
        ${eps_c !== null ? `<div class="text-xs text-gray-500">eps_c (conc): ${eps_c.toFixed(3)} permil</div>` : ''}
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

    const dimColor = '#64748b';
    const tick = 5;
    const drawDimHorizontal = (x1, x2, y, label) => {
        const x1p = toX(x1);
        const x2p = toX(x2);
        const yp = toY(y);
        svg.appendChild(createSvgElement('line', {
            x1: x1p,
            y1: yp,
            x2: x2p,
            y2: yp,
            stroke: dimColor,
            'stroke-width': 1
        }));
        svg.appendChild(createSvgElement('line', {
            x1: x1p,
            y1: yp - tick,
            x2: x1p,
            y2: yp + tick,
            stroke: dimColor,
            'stroke-width': 1
        }));
        svg.appendChild(createSvgElement('line', {
            x1: x2p,
            y1: yp - tick,
            x2: x2p,
            y2: yp + tick,
            stroke: dimColor,
            'stroke-width': 1
        }));
        const labelEl = createSvgElement('text', {
            x: (x1p + x2p) / 2,
            y: yp - 6,
            'text-anchor': 'middle',
            'font-size': 10,
            fill: dimColor
        });
        labelEl.textContent = label;
        svg.appendChild(labelEl);
    };

    const drawDimVertical = (x, y1, y2, label) => {
        const xp = toX(x);
        const y1p = toY(y1);
        const y2p = toY(y2);
        svg.appendChild(createSvgElement('line', {
            x1: xp,
            y1: y1p,
            x2: xp,
            y2: y2p,
            stroke: dimColor,
            'stroke-width': 1
        }));
        svg.appendChild(createSvgElement('line', {
            x1: xp - tick,
            y1: y1p,
            x2: xp + tick,
            y2: y1p,
            stroke: dimColor,
            'stroke-width': 1
        }));
        svg.appendChild(createSvgElement('line', {
            x1: xp - tick,
            y1: y2p,
            x2: xp + tick,
            y2: y2p,
            stroke: dimColor,
            'stroke-width': 1
        }));
        const labelEl = createSvgElement('text', {
            x: xp - 6,
            y: (y1p + y2p) / 2,
            'text-anchor': 'end',
            'font-size': 10,
            fill: dimColor
        });
        labelEl.textContent = label;
        svg.appendChild(labelEl);
    };

    if (cover > 0) {
        const coverY1 = momentPositive === false ? 0 : h - cover;
        const coverY2 = momentPositive === false ? cover : h;
        drawDimVertical(-2, coverY1, coverY2, `c = ${cover.toFixed(1)} cm`);
    }

    if (basePositions.length >= 2) {
        const spacingVal = basePositions[1] - basePositions[0];
        if (spacingVal > 0) {
            const dimOffset = barDia * 1.6;
            let dimY = momentPositive === false ? startY + dimOffset : startY - dimOffset;
            dimY = Math.max(yTop + barDia, Math.min(yBottom - barDia, dimY));
            drawDimHorizontal(basePositions[0], basePositions[1], dimY, `s = ${spacingVal.toFixed(1)} cm`);
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



