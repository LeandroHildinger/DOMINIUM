/**
 * DOMINIUM - Materials Module (NBR 6118:2023)
 * ============================================
 * Propriedades de cálculo dos materiais conforme norma brasileira.
 */

// Coeficientes de Segurança (NBR 6118:2023)
const GAMMA_C = 1.40;  // Concreto
const GAMMA_S = 1.15;  // Aço

// Módulo de Elasticidade do Aço
const ES = 210000;  // MPa (210 GPa)

/**
 * Classe para propriedades do concreto
 */
export class Concrete {
    /**
     * @param {number} fck - Resistência característica (MPa)
     * @param {string} aggregate - Tipo de agregado ('granite', 'basite', 'limestone', 'sandstone')
     */
    constructor(fck = 30, aggregate = 'granite') {
        this.fck = fck;
        this.aggregate = aggregate;

        // Coeficiente de agregado (NBR 6118:2023 Item 8.2.8)
        this.alphaE = this._getAlphaE(aggregate);
    }

    _getAlphaE(aggregate) {
        const alphaEMap = {
            'granite': 1.0,
            'basalt': 1.2,
            'limestone': 0.9,
            'sandstone': 0.7
        };
        return alphaEMap[aggregate] || 1.0;
    }

    /** Resistência de cálculo à compressão (MPa) */
    get fcd() {
        return this.fck / GAMMA_C;
    }

    /** Resistência média à tração (MPa) - NBR 6118 Item 8.2.5 */
    get fctm() {
        if (this.fck <= 50) {
            return 0.3 * Math.pow(this.fck, 2 / 3);
        } else {
            return 2.12 * Math.log(1 + 0.11 * this.fck);
        }
    }

    /** Resistência característica inferior à tração (MPa) */
    get fctk_inf() {
        return 0.7 * this.fctm;
    }

    /** Resistência característica superior à tração (MPa) */
    get fctk_sup() {
        return 1.3 * this.fctm;
    }

    /** Resistência de cálculo à tração (MPa) */
    get fctd() {
        return this.fctk_inf / GAMMA_C;
    }

    /** Módulo de elasticidade inicial (MPa) - NBR 6118:2023 */
    get Eci() {
        return this.alphaE * 5600 * Math.sqrt(this.fck);
    }

    /** Módulo de elasticidade secante (MPa) */
    get Ecs() {
        const alphaI = 0.8 + 0.2 * (this.fck / 80);
        return Math.min(alphaI, 1.0) * this.Eci;
    }

    /** Tensão no diagrama retangular (MPa) - 0.85 * fcd */
    get sigmaCD() {
        return 0.85 * this.fcd;
    }

    // ============ FADIGA (NBR 6118 Item 23.5.4) ============

    /** Limite de resistência à compressão na fadiga (MPa) */
    get fcd_fad() {
        return 0.45 * this.fcd;
    }

    /** Limite de resistência à tração na fadiga (MPa) - Item 23.5.4.2 */
    get fctd_fad() {
        return 0.30 * this.fctd;  // Redutor severo de 30%!
    }
}


/**
 * Classe para propriedades do aço de armadura
 */
export class Steel {
    /**
     * @param {number} fyk - Resistência característica (MPa)
     * @param {string} type - Tipo do aço ('CA-50', 'CA-60')
     */
    constructor(fyk = 500, type = 'CA-50') {
        this.fyk = fyk;
        this.type = type;
        this.Es = ES;
    }

    /** Resistência de cálculo (MPa) */
    get fyd() {
        return this.fyk / GAMMA_S;
    }

    /** Deformação de escoamento (por mil) */
    get epsilonYd() {
        return this.fyd / this.Es * 1000;
    }

    // ============ FADIGA (NBR 6118 Tabela 23.2) ============

    /**
     * Limite de variação de tensão para fadiga (MPa)
     * @param {number} phi - Diâmetro da barra (mm)
     * @param {string} barType - Tipo ('straight', 'bent', 'stirrup')
     */
    getDeltaSigmaFad(phi = 20, barType = 'straight') {
        // Barras dobradas ou estribos: 85 MPa
        if (barType === 'bent' || barType === 'stirrup') {
            return 85;
        }

        // Barras retas CA-50 (Tabela 23.2)
        if (phi <= 16) return 190;
        if (phi <= 20) return 185;
        if (phi <= 25) return 175;
        return 165;  // phi > 25mm
    }
}


/**
 * Classe agregadora de materiais para uma seção
 */
export class SectionMaterials {
    constructor(fck = 30, fyk = 500, aggregate = 'granite') {
        this.concrete = new Concrete(fck, aggregate);
        this.steel = new Steel(fyk);
    }

    getSummary() {
        return {
            concrete: {
                fck: this.concrete.fck,
                fcd: this.concrete.fcd.toFixed(2) + ' MPa',
                fctm: this.concrete.fctm.toFixed(2) + ' MPa',
                Ecs: (this.concrete.Ecs / 1000).toFixed(1) + ' GPa',
                fcd_fad: this.concrete.fcd_fad.toFixed(2) + ' MPa'
            },
            steel: {
                fyk: this.steel.fyk,
                fyd: this.steel.fyd.toFixed(2) + ' MPa',
                Es: (this.steel.Es / 1000).toFixed(0) + ' GPa',
                delta_sigma_fad: this.steel.getDeltaSigmaFad() + ' MPa'
            }
        };
    }
}
