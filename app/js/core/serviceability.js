/**
 * DOMINIUM - Serviceability Limit State Module (NBR 6118:2023)
 * =============================================================
 * Estados Limites de Serviço (ELS): Fissuração e Flecha
 * Referência: NBR 6118:2023 Seções 13, 17.3 e 19.3
 */

import { Concrete, Steel } from './materials.js';

/**
 * Classe para verificações de estados limites de serviço
 */
export class ServiceabilityVerifier {
    /**
     * @param {Object} geometry - {bw, h, d} em cm
     * @param {Object} materials - {fck, fyk} em MPa
     * @param {number} As - Área de aço tracionado (cm²)
     * @param {Object} options - Parâmetros opcionais
     */
    constructor(geometry, materials, As, options = {}) {
        this.bw = geometry.bw;       // Largura da alma (cm)
        this.h = geometry.h;         // Altura total (cm)
        this.d = geometry.d || (geometry.h - 5);  // Altura útil (cm)
        this.d_linha = options.d_linha || 5;      // Cobrimento superior (cm)

        this.concrete = new Concrete(materials.fck, options.aggregate || 'granite');
        this.steel = new Steel(materials.fyk);

        this.As = As;                            // Armadura tracionada (cm²)
        this.As_linha = options.As_linha || 0;   // Armadura comprimida (cm²)
        this.phi = options.phi || 20;            // Diâmetro barras (mm)
        this.n_barras = options.n_barras || Math.ceil(As / (Math.PI * (this.phi / 10) ** 2 / 4));

        // Parâmetros de serviço
        this.eta1 = options.eta1 || 2.25;        // Coef. aderência (nervurada)
        this.wk_lim = options.wk_lim || 0.3;     // Limite fissuração (mm)
        this.t_meses = options.t_meses || 70;    // Tempo para fluência (meses)

        // Relação modular
        this.alpha_e = this.steel.Es / this.concrete.Ecs;

        // Propriedades calculadas
        this._calcGrossProperties();
        this._calcStage2Properties();
    }

    // ========================================================================
    // PROPRIEDADES DA SEÇÃO
    // ========================================================================

    /**
     * Calcula propriedades da seção bruta (Estádio I)
     */
    _calcGrossProperties() {
        // Inércia bruta (seção retangular)
        this.Ic = (this.bw * this.h ** 3) / 12;  // cm⁴

        // Distância do CG à fibra tracionada
        this.yt = this.h / 2;  // cm
    }

    /**
     * Calcula propriedades no Estádio II (seção fissurada)
     * Considera armadura comprimida As'
     */
    _calcStage2Properties() {
        const n = this.alpha_e;
        const As = this.As;
        const As_linha = this.As_linha;
        const d = this.d;
        const d_linha = this.d_linha;
        const bw = this.bw;

        // Equação quadrática para x_II:
        // bw * x² / 2 + n * As' * (x - d') = n * As * (d - x)
        // bw/2 * x² + (n*As' + n*As) * x - (n*As'*d' + n*As*d) = 0
        const a = bw / 2;
        const b = n * (As_linha + As);
        const c = -(n * As_linha * d_linha + n * As * d);

        this.x_II = (-b + Math.sqrt(b ** 2 - 4 * a * c)) / (2 * a);

        // Momento de inércia no Estádio II
        this.I_II = (bw * this.x_II ** 3) / 3 +
            n * As_linha * (this.x_II - d_linha) ** 2 +
            n * As * (d - this.x_II) ** 2;
    }

    /**
     * Calcula momento de fissuração Mr (kN.m)
     * α = 1.5 para seção retangular
     */
    get Mr() {
        const alpha = 1.5;  // Seção retangular
        const fctm = this.concrete.fctm;  // MPa
        // Mr = α * fctm * Ic / yt
        // Converter: fctm (MPa = kN/cm²/10), Ic (cm⁴), yt (cm) → kN.cm → kN.m
        const Mr_kNcm = alpha * (fctm / 10) * this.Ic / this.yt;
        return Mr_kNcm / 100;  // kN.m
    }

    // ========================================================================
    // RIGIDEZ EQUIVALENTE (BRANSON)
    // ========================================================================

    /**
     * Calcula rigidez equivalente pelo método de Branson
     * @param {number} Ma - Momento atuante (kN.m)
     * @returns {number} EI_eq (kN.cm²)
     */
    calcEquivalentStiffness(Ma) {
        const Mr = this.Mr;
        const Ecs = this.concrete.Ecs / 10;  // MPa → kN/cm²

        // Se Ma < Mr, seção íntegra
        if (Math.abs(Ma) <= Mr) {
            return Ecs * this.Ic;
        }

        // Fórmula de Branson
        const ratio = Math.pow(Mr / Math.abs(Ma), 3);
        const EI_eq = Ecs * this.Ic * ratio + Ecs * this.I_II * (1 - ratio);

        return EI_eq;
    }

    // ========================================================================
    // VERIFICAÇÃO DE FISSURAÇÃO
    // ========================================================================

    /**
     * Calcula tensão na armadura (MPa)
     * @param {number} M_kNm - Momento (kN.m)
     */
    calcSteelStress(M_kNm) {
        const M = Math.abs(M_kNm) * 100;  // kN.cm
        const n = this.alpha_e;
        const sigma = M * (this.d - this.x_II) / this.I_II * n;
        return sigma * 10;  // MPa
    }

    /**
     * Verifica abertura de fissuras (wk)
     * @param {number} M_freq - Momento combinação frequente (kN.m)
     * @returns {Object} Resultado da verificação
     */
    verifyCrackWidth(M_freq) {
        const Mr = this.Mr;

        // Se não fissura, wk = 0
        if (Math.abs(M_freq) <= Mr) {
            return {
                status: 'OK',
                cracked: false,
                wk: 0,
                wk_lim: this.wk_lim,
                utilizacao: 0,
                message: 'Seção não fissurada (Estádio I)'
            };
        }

        // Tensão na armadura
        const sigma_si = this.calcSteelStress(M_freq);
        const Es = this.steel.Es;  // MPa
        const fctm = this.concrete.fctm;  // MPa
        const phi_i = this.phi;  // mm
        const eta1 = this.eta1;

        // Taxa de armadura na região de envolvimento
        // Acri = bw * (h - d + 7.5*phi)  - simplificação
        const h_cri = 2.5 * (this.h - this.d);  // cm
        const Acri = this.bw * Math.min(h_cri, this.h / 2);  // cm²
        const rho_ri = this.As / Acri;

        // Fórmula 1: wk1
        const wk1 = (phi_i / (12.5 * eta1)) * (sigma_si / Es) * (3 * sigma_si / fctm);

        // Fórmula 2: wk2
        const wk2 = (phi_i / (12.5 * eta1)) * (sigma_si / Es) * (4 / rho_ri + 45);

        // Adotar o menor
        const wk = Math.min(wk1, wk2);

        const ok = wk <= this.wk_lim;
        const utilizacao = (wk / this.wk_lim) * 100;

        return {
            status: ok ? 'OK' : 'FAIL',
            cracked: true,
            sigma_si: sigma_si,
            wk1: wk1,
            wk2: wk2,
            wk: wk,
            wk_lim: this.wk_lim,
            utilizacao: utilizacao,
            message: ok ?
                `Fissuração OK: wk = ${wk.toFixed(2)} mm ≤ ${this.wk_lim} mm` :
                `FALHA fissuração: wk = ${wk.toFixed(2)} mm > ${this.wk_lim} mm`
        };
    }

    // ========================================================================
    // CÁLCULO DE FLECHA
    // ========================================================================

    /**
     * Calcula coeficiente de fluência αf
     * @returns {number} Fator multiplicador da flecha diferida
     */
    calcCreepFactor() {
        // Tabela 17.1 da NBR 6118
        const xiTable = {
            0: 0.00, 0.5: 0.54, 1: 0.68, 2: 0.84, 3: 0.95,
            4: 1.02, 5: 1.08, 6: 1.13, 12: 1.36, 24: 1.64,
            36: 1.79, 48: 1.87, 60: 1.92, 70: 2.00
        };

        // Interpolar ξ(t)
        const t = this.t_meses;
        let xi_t = 2.0;  // Default para t >= 70
        const times = Object.keys(xiTable).map(Number).sort((a, b) => a - b);

        for (let i = 0; i < times.length - 1; i++) {
            if (t >= times[i] && t < times[i + 1]) {
                const t0 = times[i];
                const t1 = times[i + 1];
                xi_t = xiTable[t0] + (xiTable[t1] - xiTable[t0]) * (t - t0) / (t1 - t0);
                break;
            }
        }

        // ξ(t0) para t0 ≈ 1 mês (retirada do escoramento)
        const xi_t0 = 0.68;
        const delta_xi = xi_t - xi_t0;

        // Taxa de armadura de compressão
        const rho_linha = this.As_linha / (this.bw * this.d);

        // αf = Δξ / (1 + 50 * ρ')
        const alpha_f = delta_xi / (1 + 50 * rho_linha);

        return alpha_f;
    }

    /**
     * Calcula flecha por integração numérica dos momentos
     * @param {Array} moments - Array de {x, M} ao longo da viga (M em kN.m)
     * @param {number} L - Comprimento da viga (m)
     * @returns {Object} Resultado com flecha em cada ponto
     */
    calcDeflection(moments, L) {
        const n = moments.length;
        if (n < 2) return { deflections: [], maxDeflection: 0 };

        // Converter L para cm
        const L_cm = L * 100;

        // Calcular curvatura em cada ponto
        const curvatures = moments.map(pt => {
            const EI_eq = this.calcEquivalentStiffness(pt.M);
            const M_kNcm = pt.M * 100;  // kN.m → kN.cm
            return {
                x: pt.x * 100,  // m → cm
                kappa: M_kNcm / EI_eq  // 1/cm
            };
        });

        // Primeira integração (rotação) - regra do trapézio
        const rotations = [{ x: curvatures[0].x, theta: 0 }];
        for (let i = 1; i < n; i++) {
            const dx = curvatures[i].x - curvatures[i - 1].x;
            const avgKappa = (curvatures[i].kappa + curvatures[i - 1].kappa) / 2;
            const theta = rotations[i - 1].theta + avgKappa * dx;
            rotations.push({ x: curvatures[i].x, theta: theta });
        }

        // Segunda integração (flecha) - regra do trapézio
        const deflections = [{ x: rotations[0].x, f: 0 }];
        for (let i = 1; i < n; i++) {
            const dx = rotations[i].x - rotations[i - 1].x;
            const avgTheta = (rotations[i].theta + rotations[i - 1].theta) / 2;
            const f = deflections[i - 1].f + avgTheta * dx;
            deflections.push({ x: rotations[i].x, f: f });
        }

        // Aplicar condição de contorno: f(0) = 0, f(L) = 0
        // f_corrigida(x) = f(x) - f(L) * x / L
        const f_L = deflections[n - 1].f;
        for (let i = 0; i < n; i++) {
            const x = deflections[i].x;
            deflections[i].f = deflections[i].f - f_L * (x / L_cm);
            deflections[i].x = x / 100;  // cm → m (para output)
        }

        // Encontrar flecha máxima
        let maxDeflection = 0;
        let maxX = 0;
        for (const pt of deflections) {
            if (Math.abs(pt.f) > Math.abs(maxDeflection)) {
                maxDeflection = pt.f;
                maxX = pt.x;
            }
        }

        return {
            deflections: deflections,
            maxDeflection: maxDeflection,  // cm
            maxX: maxX  // m
        };
    }

    /**
     * Verifica flecha completa (imediata + diferida)
     * @param {Array} moments - Array de {x, M} (combinação quase-permanente)
     * @param {number} L - Comprimento da viga (m)
     * @returns {Object} Resultado da verificação
     */
    verifyDeflection(moments, L) {
        // Flecha imediata
        const immediate = this.calcDeflection(moments, L);
        const f0 = Math.abs(immediate.maxDeflection);  // cm

        // Fator de fluência
        const alpha_f = this.calcCreepFactor();

        // Flecha total (imediata + diferida)
        const f_total = f0 * (1 + alpha_f);

        // Limite L/250 (aceitabilidade visual)
        const L_cm = L * 100;
        const f_lim = L_cm / 250;

        const ok = f_total <= f_lim;
        const utilizacao = (f_total / f_lim) * 100;

        // Preparar deflexões totais (multiplicar pelo fator)
        const deflections_total = immediate.deflections.map(pt => ({
            x: pt.x,
            f: pt.f * (1 + alpha_f)
        }));

        return {
            status: ok ? 'OK' : 'FAIL',
            f0: f0,                    // Flecha imediata (cm)
            alpha_f: alpha_f,          // Fator de fluência
            f_total: f_total,          // Flecha total (cm)
            f_lim: f_lim,              // Limite L/250 (cm)
            maxX: immediate.maxX,      // Posição da flecha máxima (m)
            utilizacao: utilizacao,
            deflections: deflections_total,
            message: ok ?
                `Flecha OK: ${f_total.toFixed(2)} cm ≤ L/250 = ${f_lim.toFixed(2)} cm` :
                `FALHA flecha: ${f_total.toFixed(2)} cm > L/250 = ${f_lim.toFixed(2)} cm`
        };
    }

    // ========================================================================
    // VERIFICAÇÃO COMPLETA
    // ========================================================================

    /**
     * Executa todas as verificações de serviço
     * @param {number} M_freq - Momento frequente para fissuração (kN.m)
     * @param {Array} moments_qp - Momentos quase-permanentes para flecha [{x, M}]
     * @param {number} L - Vão da viga (m)
     * @returns {Object} Resultado consolidado
     */
    verifyAll(M_freq, moments_qp, L) {
        const crackResult = this.verifyCrackWidth(M_freq);
        const deflectionResult = this.verifyDeflection(moments_qp, L);

        const allOk = crackResult.status === 'OK' && deflectionResult.status === 'OK';

        return {
            status: allOk ? 'OK' : 'FAIL',
            cracking: crackResult,
            deflection: deflectionResult,
            material: {
                Ecs: this.concrete.Ecs,
                fctm: this.concrete.fctm,
                alpha_e: this.alpha_e
            },
            section: {
                Mr: this.Mr,
                Ic: this.Ic,
                I_II: this.I_II,
                x_II: this.x_II
            },
            message: allOk ?
                'Todas verificações de serviço OK' :
                'FALHA em verificação de serviço'
        };
    }
}
