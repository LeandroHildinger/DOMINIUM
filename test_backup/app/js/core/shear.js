/**
 * DOMINIUM - Shear Verification Module (NBR 6118:2023)
 * =====================================================
 * Verificação de cisalhamento conforme NBR 6118:2023 Modelo I (θ = 45°)
 * Inclui regra de fadiga (redução de Vc em 50%)
 */

import { Concrete, Steel } from './materials.js';

// Limite de tensão no estribo
const FYWD_MAX = 435;  // MPa

/**
 * Classe para verificação de cisalhamento
 */
export class ShearVerifier {
    /**
     * @param {Object} geometry - {bw, h, d} em cm
     * @param {Object} materials - {fck, fywk} em MPa
     */
    constructor(geometry, materials) {
        this.bw = geometry.bw;
        this.h = geometry.h;
        this.d = geometry.d || (geometry.h - 5);

        this.fck = materials.fck;
        this.fywk = materials.fywk || 500;

        this.concrete = new Concrete(this.fck);

        // Tensão de cálculo do estribo (limitada a 435 MPa)
        this.fywd = Math.min(this.fywk / 1.15, FYWD_MAX);
    }

    /**
     * Coeficiente de redução da biela
     */
    get alphaV2() {
        return 1 - this.fck / 250;
    }

    /**
     * Resistência da biela comprimida (kN)
     */
    get Vrd2() {
        const fcd_kNcm2 = this.concrete.fcd * 0.1;
        return 0.27 * this.alphaV2 * fcd_kNcm2 * this.bw * this.d;
    }

    /**
     * Parcela resistida pelo concreto - Estático (kN)
     */
    get Vc0() {
        const fctd_kNcm2 = this.concrete.fctd * 0.1;
        return 0.6 * fctd_kNcm2 * this.bw * this.d;
    }

    /**
     * Parcela resistida pelo concreto - FADIGA (kN)
     * NBR 6118 Item 23.5.5: Reduzir em 50%
     */
    get Vc_fad() {
        return 0.5 * this.Vc0;
    }

    /**
     * Taxa mínima de armadura transversal
     */
    get rhoSwMin() {
        return 0.2 * this.concrete.fctm / this.fywk;
    }

    /**
     * Armadura mínima (cm²/m)
     */
    get AswMin() {
        return this.rhoSwMin * this.bw * 100;
    }

    /**
     * Calcula armadura necessária para ELU
     * @param {number} Vsd - Cortante de cálculo (kN)
     * @returns {Object} Resultado da verificação
     */
    designStirrupsELU(Vsd) {
        const Vsd_abs = Math.abs(Vsd);

        // Verificação da biela
        const ratioBiela = Vsd_abs / this.Vrd2;
        const bielaOk = ratioBiela <= 1.0;

        if (!bielaOk) {
            return {
                status: 'FAIL',
                message: 'Esmagamento da biela! Aumentar seção.',
                Vsd: Vsd_abs,
                Vrd2: this.Vrd2,
                ratioBiela: ratioBiela * 100
            };
        }

        // Força no aço
        const Vsw = Math.max(0, Vsd_abs - this.Vc0);

        // Armadura necessária (cm²/m)
        const fywd_kNcm2 = this.fywd * 0.1;
        const Asw_calc = Vsw > 0 ? (Vsw / (0.9 * this.d * fywd_kNcm2)) * 100 : 0;

        // Armadura final
        const Asw_final = Math.max(Asw_calc, this.AswMin);

        // Espaçamento máximo
        const sMax = Vsd_abs <= 0.67 * this.Vrd2 ?
            Math.min(0.6 * this.d, 30) :
            Math.min(0.3 * this.d, 20);

        return {
            status: 'OK',
            Vsd: Vsd_abs,
            Vrd2: this.Vrd2,
            ratioBiela: ratioBiela * 100,
            Vc0: this.Vc0,
            Vsw: Vsw,
            Asw_calc: Asw_calc,
            Asw_min: this.AswMin,
            Asw_final: Asw_final,
            sMax: sMax,
            message: `Biela OK (${(ratioBiela * 100).toFixed(1)}% de utilização)`
        };
    }

    /**
     * Verifica fadiga dos estribos
     * @param {number} Vmax - Cortante máximo de fadiga (kN)
     * @param {number} Vmin - Cortante mínimo de fadiga (kN)
     * @param {number} Asw_s - Armadura adotada (cm²/m)
     * @returns {Object} Resultado da verificação de fadiga
     */
    verifyFatigueELU(Vmax, Vmin, Asw_s) {
        const DELTA_SIGMA_LIM = 85;  // MPa (Tabela 23.2)

        // Variação de cortante
        const deltaV = Math.abs(Vmax) - Math.abs(Vmin);

        // Parcela do aço (usando Vc reduzido em 50%!)
        const deltaVsw = Math.max(0, deltaV - this.Vc_fad);

        if (deltaVsw === 0) {
            return {
                status: 'OK',
                message: 'Concreto absorve toda variação',
                deltaV: deltaV,
                Vc_fad: this.Vc_fad,
                deltaVsw: 0,
                deltaSigma: 0,
                limite: DELTA_SIGMA_LIM,
                utilizacao: 0
            };
        }

        // Variação de tensão no estribo (MPa)
        // Asw_s em cm²/m -> converter para cm²/cm = Asw_s / 100
        const Asw_cm = Asw_s / 100;  // cm²/cm
        const deltaSigma = (deltaVsw / (0.9 * this.d * Asw_cm)) * 10;  // MPa

        const utilizacao = (deltaSigma / DELTA_SIGMA_LIM) * 100;
        const fatigueOk = deltaSigma <= DELTA_SIGMA_LIM;

        return {
            status: fatigueOk ? 'OK' : 'FAIL',
            deltaV: deltaV,
            Vc_fad: this.Vc_fad,
            deltaVsw: deltaVsw,
            deltaSigma: deltaSigma,
            limite: DELTA_SIGMA_LIM,
            utilizacao: utilizacao,
            message: fatigueOk ?
                `Fadiga OK (${utilizacao.toFixed(1)}%)` :
                `FALHA por fadiga! (${utilizacao.toFixed(1)}%)`
        };
    }

    /**
     * Calcula a decalagem do diagrama de momentos (NBR 6118:2023)
     * @param {number} Vsd - Cortante máximo de cálculo (kN)
     * @returns {number} Decalagem al (cm)
     */
    calcDecalagem(Vsd) {
        const Vsd_abs = Math.abs(Vsd);

        // Fórmula atualizada NBR 6118:2023 Item 17.4.2.2-c
        if (Vsd_abs <= this.Vc0) {
            return 0.5 * this.d;
        }

        const al = 0.5 * this.d * (Vsd_abs / (Vsd_abs - this.Vc0));

        // Limite inferior
        return Math.max(al, 0.5 * this.d);
    }
}
