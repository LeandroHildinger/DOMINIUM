/**
 * DOMINIUM - Fatigue Verification Module (NBR 6118:2023)
 * =======================================================
 * Verificação de fadiga conforme NBR 6118:2023 Seção 23
 * Inclui: Armadura longitudinal, Concreto (compressão e tração)
 */

import { Concrete, Steel } from './materials.js';

/**
 * Classe para verificação de fadiga
 */
export class FatigueVerifier {
    /**
     * @param {Object} geometry - {bw, h, d} em cm
     * @param {Object} materials - {fck, fyk} em MPa
     * @param {number} As - Área de aço (cm²)
     * @param {number} phi - Diâmetro da barra (mm)
     */
    constructor(geometry, materials, As, phi = 20) {
        this.bw = geometry.bw;
        this.h = geometry.h;
        this.d = geometry.d || (geometry.h - 5);

        this.concrete = new Concrete(materials.fck);
        this.steel = new Steel(materials.fyk);

        this.As = As;
        this.phi = phi;

        // Propriedades da seção fissurada (Estádio II)
        this._calcStage2Properties();
    }

    /**
     * Calcula propriedades no Estádio II
     */
    _calcStage2Properties() {
        const n = this.steel.Es / this.concrete.Ecs;  // Relação modular

        // Linha neutra no Estádio II (seção retangular simples)
        // Equação: bw * x² / 2 = n * As * (d - x)
        const a = this.bw / 2;
        const b = n * this.As;
        const c = -n * this.As * this.d;

        this.x_II = (-b + Math.sqrt(b ** 2 - 4 * a * c)) / (2 * a);

        // Momento de inércia no Estádio II
        this.I_II = (this.bw * this.x_II ** 3) / 3 +
            n * this.As * (this.d - this.x_II) ** 2;

        // Braço de alavanca
        this.z = this.d - this.x_II / 3;
    }

    /**
     * Calcula tensão no aço para um dado momento
     * @param {number} M_kNm - Momento (kN.m)
     * @returns {number} Tensão no aço (MPa)
     */
    calcSteelStress(M_kNm) {
        const M = M_kNm * 100;  // kN.cm
        // σs = M * (d - x_II) / I_II * n
        const n = this.steel.Es / this.concrete.Ecs;
        const sigma = M * (this.d - this.x_II) / this.I_II * n;
        return sigma * 10;  // Converte para MPa
    }

    /**
     * Calcula tensão de compressão no concreto
     * @param {number} M_kNm - Momento (kN.m)
     * @returns {number} Tensão no concreto (MPa)
     */
    calcConcreteStress(M_kNm) {
        const M = M_kNm * 100;  // kN.cm
        // σc = M * x_II / I_II
        const sigma = M * this.x_II / this.I_II;
        return sigma * 10;  // Converte para MPa
    }

    /**
     * Verifica fadiga da armadura longitudinal
     * @param {number} Mmax - Momento máximo de fadiga (kN.m)
     * @param {number} Mmin - Momento mínimo de fadiga (kN.m)
     * @returns {Object} Resultado da verificação
     */
    verifySteelFatigue(Mmax, Mmin) {
        const sigmaMax = this.calcSteelStress(Math.abs(Mmax));
        const sigmaMin = this.calcSteelStress(Math.abs(Mmin));

        const deltaSigma = Math.abs(sigmaMax - sigmaMin);
        const limite = this.steel.getDeltaSigmaFad(this.phi, 'straight');

        const utilizacao = (deltaSigma / limite) * 100;
        const ok = deltaSigma <= limite;

        return {
            status: ok ? 'OK' : 'FAIL',
            Mmax: Mmax,
            Mmin: Mmin,
            sigmaMax: sigmaMax,
            sigmaMin: sigmaMin,
            deltaSigma: deltaSigma,
            limite: limite,
            utilizacao: utilizacao,
            message: ok ?
                `Fadiga do aço OK (${utilizacao.toFixed(1)}%)` :
                `FALHA por fadiga do aço! (${utilizacao.toFixed(1)}%)`
        };
    }

    /**
     * Verifica fadiga do concreto à compressão
     * NBR 6118 Item 23.5.4.1: σc,max <= 0.45 * fcd
     * @param {number} Mmax - Momento máximo (kN.m)
     * @returns {Object} Resultado da verificação
     */
    verifyConcreteCompressionFatigue(Mmax) {
        const sigmaC = this.calcConcreteStress(Math.abs(Mmax));
        const limite = this.concrete.fcd_fad;  // 0.45 * fcd

        const utilizacao = (sigmaC / limite) * 100;
        const ok = sigmaC <= limite;

        return {
            status: ok ? 'OK' : 'FAIL',
            Mmax: Mmax,
            sigmaC: sigmaC,
            limite: limite,
            utilizacao: utilizacao,
            message: ok ?
                `Fadiga do concreto (compressão) OK (${utilizacao.toFixed(1)}%)` :
                `FALHA por fadiga do concreto! (${utilizacao.toFixed(1)}%)`
        };
    }

    /**
     * Verifica se a seção fissura sob cargas de fadiga
     * NBR 6118 Item 23.5.4.2: fctd,fad = 0.3 * fctd
     * @param {number} Mmax - Momento máximo (kN.m)
     * @returns {Object} Resultado (fissurada ou não)
     */
    checkCrackingFatigue(Mmax) {
        // Tensão de tração máxima na seção não-fissurada
        // Simplificação: σt = 6*M / (bw * h²) para seção retangular
        const M = Math.abs(Mmax) * 100;  // kN.cm
        const sigmaTraction = 6 * M / (this.bw * this.h ** 2) * 10;  // MPa

        const limite = this.concrete.fctd_fad;  // 0.3 * fctd

        const cracked = sigmaTraction > limite;

        return {
            sigmaTraction: sigmaTraction,
            limite: limite,
            cracked: cracked,
            stage: cracked ? 'II' : 'I',
            message: cracked ?
                `Seção FISSURADA sob fadiga (Estádio II)` :
                `Seção não-fissurada (Estádio I)`
        };
    }

    /**
     * Verifica completa de fadiga para uma seção
     * @param {number} Mmax - Momento máximo (kN.m)
     * @param {number} Mmin - Momento mínimo (kN.m)
     * @returns {Object} Resultado consolidado
     */
    verifyAll(Mmax, Mmin) {
        const steelResult = this.verifySteelFatigue(Mmax, Mmin);
        const concreteResult = this.verifyConcreteCompressionFatigue(Mmax);
        const crackingResult = this.checkCrackingFatigue(Mmax);

        const allOk = steelResult.status === 'OK' && concreteResult.status === 'OK';

        return {
            status: allOk ? 'OK' : 'FAIL',
            steel: steelResult,
            concrete: concreteResult,
            cracking: crackingResult,
            message: allOk ?
                'Todas verificações de fadiga OK' :
                'FALHA em verificação de fadiga'
        };
    }
}
