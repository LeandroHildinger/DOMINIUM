/**
 * DOMINIUM - Load Processor Module (v5 - Excel Final)
 * ====================================================
 * Dados extraidos do "Exemplo Viga Ponte Rolante.xlsx" (versao final)
 *
 * IMPORTANTE: DEAD e TRILHO tem 2 pontos em x=6 para capturar a
 * descontinuidade do cortante no apoio central.
 */

// ====================================================================================
// DADOS REAIS DO SAP2000 (Excel Final - Linhas Duplicadas Removidas)
// ====================================================================================

const DEFAULT_DEAD_DATA = [
    { "x": 0.0, "V": -9.57, "M": 0.0 },
    { "x": 0.5, "V": -7.45, "M": 4.25 },
    { "x": 1.0, "V": -5.33, "M": 7.44 },
    { "x": 1.5, "V": -3.2, "M": 9.58 },
    { "x": 2.0, "V": -1.08, "M": 10.65 },
    { "x": 2.5, "V": 1.04, "M": 10.66 },
    { "x": 3.0, "V": 3.16, "M": 9.61 },
    { "x": 3.5, "V": 5.28, "M": 7.51 },
    { "x": 4.0, "V": 7.4, "M": 4.34 },
    { "x": 4.5, "V": 9.52, "M": 0.11 },
    { "x": 5.0, "V": 11.64, "M": -5.18 },
    { "x": 5.5, "V": 13.76, "M": -11.53 },
    { "x": 6.0, "V": 15.88, "M": -18.95 },
    { "x": 6.0, "V": -15.88, "M": -18.95 },
    { "x": 6.5, "V": -13.77, "M": -11.55 },
    { "x": 7.0, "V": -11.64, "M": -5.2 },
    { "x": 7.5, "V": -9.52, "M": 0.1 },
    { "x": 8.0, "V": -7.4, "M": 4.33 },
    { "x": 8.5, "V": -5.28, "M": 7.5 },
    { "x": 9.0, "V": -3.16, "M": 9.61 },
    { "x": 9.5, "V": -1.04, "M": 10.66 },
    { "x": 10.0, "V": 1.08, "M": 10.65 },
    { "x": 10.5, "V": 3.2, "M": 9.58 },
    { "x": 11.0, "V": 5.32, "M": 7.45 },
    { "x": 11.5, "V": 7.44, "M": 4.25 },
    { "x": 12.0, "V": 9.57, "M": 0.0 }
];

const DEFAULT_TRILHO_DATA = [
    { "x": 0.0, "V": -1.13, "M": 0.0 },
    { "x": 0.5, "V": -0.88, "M": 0.5 },
    { "x": 1.0, "V": -0.63, "M": 0.88 },
    { "x": 1.5, "V": -0.38, "M": 1.13 },
    { "x": 2.0, "V": -0.13, "M": 1.26 },
    { "x": 2.5, "V": 0.12, "M": 1.26 },
    { "x": 3.0, "V": 0.37, "M": 1.13 },
    { "x": 3.5, "V": 0.62, "M": 0.88 },
    { "x": 4.0, "V": 0.87, "M": 0.51 },
    { "x": 4.5, "V": 1.12, "M": 0.01 },
    { "x": 5.0, "V": 1.37, "M": -0.61 },
    { "x": 5.5, "V": 1.62, "M": -1.36 },
    { "x": 6.0, "V": 1.87, "M": -2.23 },
    { "x": 6.0, "V": -1.87, "M": -2.23 },
    { "x": 6.5, "V": -1.62, "M": -1.36 },
    { "x": 7.0, "V": -1.37, "M": -0.61 },
    { "x": 7.5, "V": -1.12, "M": 0.01 },
    { "x": 8.0, "V": -0.87, "M": 0.51 },
    { "x": 8.5, "V": -0.62, "M": 0.88 },
    { "x": 9.0, "V": -0.37, "M": 1.13 },
    { "x": 9.5, "V": -0.12, "M": 1.26 },
    { "x": 10.0, "V": 0.13, "M": 1.26 },
    { "x": 10.5, "V": 0.38, "M": 1.13 },
    { "x": 11.0, "V": 0.63, "M": 0.88 },
    { "x": 11.5, "V": 0.88, "M": 0.5 },
    { "x": 12.0, "V": 1.13, "M": 0.0 }
];

const DEFAULT_ENV_MOVEL_DATA = [
    { "x": 0.0, "V_max": 10.47, "V_min": -105.52, "M_max": 0.0, "M_min": 0.0 },
    { "x": 0.5, "V_max": 10.47, "V_min": -91.3, "M_max": 45.64, "M_min": -5.23 },
    { "x": 1.0, "V_max": 15.51, "V_min": -77.59, "M_max": 77.58, "M_min": -10.47 },
    { "x": 1.5, "V_max": 23.11, "V_min": -64.54, "M_max": 96.79, "M_min": -15.7 },
    { "x": 2.0, "V_max": 30.51, "V_min": -52.25, "M_max": 104.49, "M_min": -20.94 },
    { "x": 2.5, "V_max": 37.65, "V_min": -40.87, "M_max": 102.17, "M_min": -26.17 },
    { "x": 3.0, "V_max": 44.47, "V_min": -30.53, "M_max": 91.58, "M_min": -31.41 },
    { "x": 3.5, "V_max": 58.69, "V_min": -24.09, "M_max": 94.54, "M_min": -36.64 },
    { "x": 4.0, "V_max": 72.39, "V_min": -18.11, "M_max": 85.37, "M_min": -41.88 },
    { "x": 4.5, "V_max": 85.45, "V_min": -12.65, "M_max": 65.42, "M_min": -47.11 },
    { "x": 5.0, "V_max": 97.74, "V_min": -7.77, "M_max": 38.83, "M_min": -52.35 },
    { "x": 5.5, "V_max": 109.12, "V_min": -3.53, "M_max": 19.42, "M_min": -57.58 },
    { "x": 6.0, "V_max": 119.46, "V_min": 0.0, "M_max": 0.0, "M_min": -73.3 },
    { "x": 6.0, "V_max": 0.0, "V_min": -109.16, "M_max": 0.0, "M_min": -73.3 },
    { "x": 6.5, "V_max": 3.52, "V_min": -109.16, "M_max": 19.35, "M_min": -57.6 },
    { "x": 7.0, "V_max": 7.75, "V_min": -97.78, "M_max": 38.77, "M_min": -52.36 },
    { "x": 7.5, "V_max": 12.63, "V_min": -85.49, "M_max": 65.34, "M_min": -47.13 },
    { "x": 8.0, "V_max": 18.1, "V_min": -72.43, "M_max": 85.34, "M_min": -41.89 },
    { "x": 8.5, "V_max": 24.08, "V_min": -58.72, "M_max": 94.53, "M_min": -36.65 },
    { "x": 9.0, "V_max": 30.51, "V_min": -44.5, "M_max": 91.57, "M_min": -31.42 },
    { "x": 9.5, "V_max": 40.86, "V_min": -37.67, "M_max": 102.16, "M_min": -26.18 },
    { "x": 10.0, "V_max": 52.24, "V_min": -30.52, "M_max": 104.49, "M_min": -20.95 },
    { "x": 10.5, "V_max": 64.52, "V_min": -23.12, "M_max": 96.8, "M_min": -15.71 },
    { "x": 11.0, "V_max": 77.58, "V_min": -15.52, "M_max": 77.6, "M_min": -10.47 },
    { "x": 11.5, "V_max": 91.29, "V_min": -10.47, "M_max": 45.65, "M_min": -5.24 },
    { "x": 12.0, "V_max": 105.52, "V_min": -10.47, "M_max": 0.0, "M_min": 0.0 }
];

// ====================================================================================
// CLASSE LOAD PROCESSOR
// ====================================================================================

export class LoadProcessor {
    constructor() {
        this.totalLength = 12.0;
        this.frames = [
            { name: '1', length: 6, startX: 0, endX: 6 },
            { name: '2', length: 6, startX: 6, endX: 12 }
        ];
        this.caseData = {
            DEAD: DEFAULT_DEAD_DATA,
            TRILHO: DEFAULT_TRILHO_DATA,
            ENV_MOVEL: DEFAULT_ENV_MOVEL_DATA
        };
    }

    setCaseData(data = {}) {
        if (Array.isArray(data.dead) && data.dead.length) {
            this.caseData.DEAD = data.dead;
        }
        if (Array.isArray(data.trilho) && data.trilho.length) {
            this.caseData.TRILHO = data.trilho;
        }
        if (Array.isArray(data.envMovel) && data.envMovel.length) {
            this.caseData.ENV_MOVEL = data.envMovel;
        }
        if (Array.isArray(data.frames) && data.frames.length) {
            this.frames = data.frames;
        }
        if (typeof data.totalLength === "number" && !Number.isNaN(data.totalLength)) {
            this.totalLength = data.totalLength;
        }
    }

    processGlobalGeometry() {
        return {
            frames: this.frames,
            totalLength: this.totalLength
        };
    }

    /**
     * Retorna dados para um caso de carga especifico
     */
    getLoadCaseData(loadCase) {
        // Casos simples (DEAD, TRILHO)
        if (loadCase === "DEAD" || loadCase === "TRILHO") {
            const sourceData = loadCase === "DEAD" ? this.caseData.DEAD : this.caseData.TRILHO;
            return {
                stations: sourceData.map(d => d.x),
                M_values: sourceData.map(d => d.M),
                V_values: sourceData.map(d => d.V)
            };
        }

        // Envoltoria (ENV_MOVEL)
        if (loadCase === "ENV_MOVEL") {
            return {
                stations: this.caseData.ENV_MOVEL.map(d => d.x),
                M_max: this.caseData.ENV_MOVEL.map(d => d.M_max),
                M_min: this.caseData.ENV_MOVEL.map(d => d.M_min),
                V_max: this.caseData.ENV_MOVEL.map(d => d.V_max),
                V_min: this.caseData.ENV_MOVEL.map(d => d.V_min)
            };
        }

        // Combinacoes (ELU, FADIGA)
        if (loadCase === "ELU" || loadCase === "FADIGA") {
            // Para combinacoes, usar ENV_MOVEL como base
            const mobile = this.getLoadCaseData("ENV_MOVEL");

            const gamma_g = loadCase === "ELU" ? 1.4 : 1.0;
            const gamma_q = loadCase === "ELU" ? 1.4 : 0.5;

            const result = {
                stations: mobile.stations,
                M_max: [],
                M_min: [],
                V_max: [],
                V_min: []
            };

            const mapByX = (rows) => {
                const map = new Map();
                for (const row of rows) {
                    const key = row.x;
                    if (!map.has(key)) {
                        map.set(key, []);
                    }
                    map.get(key).push(row);
                }
                return map;
            };

            const deadByX = mapByX(this.caseData.DEAD);
            const trilhoByX = mapByX(this.caseData.TRILHO);
            const seen = new Map();

            const pickByOccurrence = (map, x, occurrence, field) => {
                const list = map.get(x);
                if (!list || list.length === 0) {
                    return 0;
                }
                const idx = Math.min(occurrence, list.length - 1);
                const value = list[idx] && list[idx][field];
                return value === undefined ? 0 : value;
            };

            // Interpolar valores permanentes para as posicoes da envoltoria
            for (let i = 0; i < mobile.stations.length; i++) {
                const x = mobile.stations[i];
                const occurrence = seen.get(x) || 0;
                seen.set(x, occurrence + 1);

                const M_dead = pickByOccurrence(deadByX, x, occurrence, "M");
                const V_dead = pickByOccurrence(deadByX, x, occurrence, "V");
                const M_trilho = pickByOccurrence(trilhoByX, x, occurrence, "M");
                const V_trilho = pickByOccurrence(trilhoByX, x, occurrence, "V");

                const M_perm = M_dead + M_trilho;
                const V_perm = V_dead + V_trilho;

                result.M_max.push(gamma_g * M_perm + gamma_q * mobile.M_max[i]);
                result.M_min.push(gamma_g * M_perm + gamma_q * mobile.M_min[i]);
                result.V_max.push(gamma_g * V_perm + gamma_q * mobile.V_max[i]);
                result.V_min.push(gamma_g * V_perm + gamma_q * mobile.V_min[i]);
            }
            return result;
        }

        return { stations: [], M_values: [], V_values: [] };
    }

    /**
     * Identifica secoes criticas globais
     */
    findCriticalSections() {
        const dataElu = this.getLoadCaseData("ELU");
        const dataFad = this.getLoadCaseData("FADIGA");
        const criticalSections = [];

        const hasElu = dataElu && Array.isArray(dataElu.stations) && dataElu.stations.length > 0;
        if (!hasElu) {
            return criticalSections;
        }

        const pickMaxAbsIndex = (maxArr = [], minArr = []) => {
            const count = Math.min(maxArr.length, minArr.length);
            let bestIdx = 0;
            let bestVal = -Infinity;
            for (let i = 0; i < count; i++) {
                const vMax = Math.abs(maxArr[i] || 0);
                const vMin = Math.abs(minArr[i] || 0);
                const v = Math.max(vMax, vMin);
                if (v > bestVal) {
                    bestVal = v;
                    bestIdx = i;
                }
            }
            return bestIdx;
        };

        const pickMaxDeltaIndex = (maxArr = [], minArr = []) => {
            const count = Math.min(maxArr.length, minArr.length);
            let bestIdx = 0;
            let bestVal = -Infinity;
            for (let i = 0; i < count; i++) {
                const delta = Math.abs(Math.abs(maxArr[i] || 0) - Math.abs(minArr[i] || 0));
                if (delta > bestVal) {
                    bestVal = delta;
                    bestIdx = i;
                }
            }
            return bestIdx;
        };

        const addSection = (id, name, idx, data) => {
            if (!data || !Array.isArray(data.stations) || data.stations.length === 0) {
                return;
            }
            const safeIdx = Math.max(0, Math.min(idx, data.stations.length - 1));
            criticalSections.push({
                id: id,
                name: name,
                x: data.stations[safeIdx],
                M_max: data.M_max[safeIdx],
                M_min: data.M_min[safeIdx],
                V_max: data.V_max[safeIdx],
                V_min: data.V_min[safeIdx]
            });
        };

        const idxFlex = pickMaxAbsIndex(dataElu.M_max || [], dataElu.M_min || []);
        const idxShear = pickMaxAbsIndex(dataElu.V_max || [], dataElu.V_min || []);
        addSection("global-flex", "Crítica Global - Flexão", idxFlex, dataElu);
        addSection("global-shear", "Crítica Global - Cortante", idxShear, dataElu);

        if (dataFad && Array.isArray(dataFad.stations) && dataFad.stations.length > 0) {
            const idxFat = pickMaxDeltaIndex(dataFad.M_max || [], dataFad.M_min || []);
            addSection("global-fatigue", "Crítica Global - Fadiga", idxFat, dataFad);
        }

        return criticalSections;
    }

    getAvailableLoadCases() {
        return [
            { id: "DEAD", label: "Peso Próprio", color: "#607d8b" },
            { id: "TRILHO", label: "Trilho", color: "#795548" },
            { id: "ENV_MOVEL", label: "Trem (Carga Móvel)", color: "#ff5722" },
            { id: "ELU", label: "ELU (Combinado)", color: "#d32f2f" },
            { id: "FADIGA", label: "Fadiga (Frequente)", color: "#7b1fa2" }
        ];
    }

    getSummary() {
        return {
            totalLength: this.totalLength,
            numFrames: this.frames.length
        };
    }
}
