/**
 * DOMINIUM - Bending Verification Module (NBR 6118:2023)
 * =======================================================
 * Verificação de flexão no ELU conforme NBR 6118:2023 Item 17.2.2
 */

import { Concrete, Steel } from './materials.js';

// Constantes do diagrama retangular (fck <= 50 MPa)
const LAMBDA = 0.80;
const ALPHA_C = 0.85;
const EPSILON_CU = 3.5;  // Deformação última do concreto (‰)
const XI_LIM = 0.45;     // Limite de ductilidade x/d (fck <= 50)

/**
 * Classe para verificação de flexão
 */
export class BendingVerifier {
    /**
     * @param {Object} geometry - {bw, h, d, c_nom} em cm
     * @param {Object} materials - {fck, fyk} em MPa
     */
    constructor(geometry, materials) {
        this.bw = geometry.bw;  // Largura (cm)
        this.h = geometry.h;    // Altura total (cm)
        this.d = geometry.d || (geometry.h - 5);  // Altura útil (cm)
        this.c_nom = geometry.c_nom || 3.0;

        this.concrete = new Concrete(materials.fck);
        this.steel = new Steel(materials.fyk);

        // Tensões em kN/cm² para compatibilidade de unidades
        this.sigmaCD_kNcm2 = this.concrete.sigmaCD * 0.1;
        this.fyd_kNcm2 = this.steel.fyd * 0.1;
    }

    /**
     * Calcula a posição da linha neutra (cm)
     * @param {number} Md_kNm - Momento de cálculo em kN.m
     * @returns {{x: number, valid: boolean}}
     */
    calcNeutralAxis(Md_kNm) {
        const Md = Md_kNm * 100;  // Converte para kN.cm

        // Equação quadrática: a*x² + b*x + c = 0
        const a = 0.5 * LAMBDA ** 2 * this.bw * this.sigmaCD_kNcm2;
        const b = -LAMBDA * this.bw * this.sigmaCD_kNcm2 * this.d;
        const c = Md;

        const delta = b ** 2 - 4 * a * c;

        if (delta < 0) {
            return { x: 0, valid: false };
        }

        const x = (-b - Math.sqrt(delta)) / (2 * a);

        return {
            x: x,
            valid: x > 0 && x < this.d
        };
    }

    /**
     * Calcula a armadura necessária (cm²)
     * @param {number} Md_kNm - Momento de cálculo em kN.m
     * @returns {Object} Resultado do dimensionamento
     */
    designReinforcement(Md_kNm) {
        const { x, valid } = this.calcNeutralAxis(Math.abs(Md_kNm));

        if (!valid) {
            return {
                status: 'ERROR',
                message: 'Momento excessivo para a seção',
                As_calc: 0,
                x: 0,
                xi: 0
            };
        }

        const xi = x / this.d;
        const z = this.d - 0.5 * LAMBDA * x;

        // Área de aço
        const Md = Math.abs(Md_kNm) * 100;  // kN.cm
        const As_calc = Md / (this.fyd_kNcm2 * z);

        // Armadura mínima (rho_min = 0.15% para fck <= 30)
        const As_min = 0.0015 * this.bw * this.h;

        const As_final = Math.max(As_calc, As_min);

        // Verificação de ductilidade
        const ductilityOk = xi <= XI_LIM;

        return {
            status: ductilityOk ? 'OK' : 'WARNING',
            Md: Md_kNm,
            x: x,
            xi: xi,
            xi_lim: XI_LIM,
            z: z,
            As_calc: As_calc,
            As_min: As_min,
            As_final: As_final,
            ductilityOk: ductilityOk,
            message: ductilityOk ?
                `Seção dúctil (x/d = ${xi.toFixed(3)})` :
                `ATENÇÃO: x/d = ${xi.toFixed(3)} > ${XI_LIM} (armadura dupla recomendada)`
        };
    }

    /**
     * Verifica uma seção com armadura conhecida
     * @param {number} Md_kNm - Momento de cálculo (kN.m)
     * @param {number} As_prov - Armadura provida (cm²)
     * @returns {Object} Resultado da verificação
     */
    verifySection(Md_kNm, As_prov) {
        const design = this.designReinforcement(Md_kNm);

        const ratio = design.As_final / As_prov;
        const utilizacao = ratio * 100;

        return {
            ...design,
            As_prov: As_prov,
            utilizacao: utilizacao,
            verificado: utilizacao <= 100,
            status: utilizacao <= 100 ? 'OK' : 'FAIL'
        };
    }

    /**
     * Calcula o momento resistente para uma armadura dada
     * @param {number} As - Área de aço (cm²)
     * @returns {number} Momento resistente (kN.m)
     */
    calcResistantMoment(As) {
        // Força no aço
        const Rs = As * this.fyd_kNcm2;

        // Linha neutra (iteração simplificada)
        const x = Rs / (LAMBDA * this.bw * this.sigmaCD_kNcm2);

        if (x > this.d) {
            return 0;  // Armadura excessiva
        }

        const z = this.d - 0.5 * LAMBDA * x;
        const Mrd = Rs * z / 100;  // Converte para kN.m

        return Mrd;
    }
}
