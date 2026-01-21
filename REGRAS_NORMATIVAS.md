# Regras Normativas e Parâmetros de Cálculo (NBR 6118:2023 / NBR 7188:2024)

Este arquivo define as constantes físicas, coeficientes de segurança e fórmulas normativas que devem ser utilizadas rigorosamente pelo motor de cálculo do aplicativo **Dominium**.

---

## 1. Propriedades dos Materiais (NBR 6118:2023)

### 1.1 Concreto (Grupo I: fck <= 50 MPa)
*   **Peso Específico ($\gamma_{conc}$):** 25 kN/m³ (Concreto Armado) [1].
*   **Coeficiente de Ponderação ($\gamma_c$):** 1.40 [2].
*   **Resistência de Cálculo ($f_{cd}$):** $f_{cd} = f_{ck} / \gamma_c$ [3].
*   **Resistência à Tração Média ($f_{ct,m}$):**
    $$f_{ct,m} = 0.3 \cdot f_{ck}^{2/3} \quad (MPa)$$ [4].
*   **Resistência à Tração Inferior ($f_{ctk,inf}$):**
    $$f_{ctk,inf} = 0.7 \cdot f_{ct,m}$$ [4].
*   **Módulo de Elasticidade Inicial ($E_{ci}$):**
    $$E_{ci} = \alpha_E \cdot 5600 \cdot \sqrt{f_{ck}} \quad (MPa)$$
    *   Adotar $\alpha_E = 1.2$ (Agregado Basalto/Diabásio) como padrão [5].
*   **Módulo de Elasticidade Secante ($E_{cs}$):**
    $$E_{cs} = \alpha_i \cdot E_{ci}$$
    $$\alpha_i = 0.8 + 0.2 \cdot \frac{f_{ck}}{80} \le 1.0$$ [6].

### 1.2 Aço (Armadura Passiva)
*   **Coeficiente de Ponderação ($\gamma_s$):** 1.15 [2].
*   **Módulo de Elasticidade ($E_s$):** 210 GPa (210.000 MPa) [7].
*   **Resistência de Cálculo ($f_{yd}$):** $f_{yd} = f_{yk} / \gamma_s$ [8].

---

## 2. Cargas Móveis e Impacto (NBR 7188:2024)

**ATENÇÃO:** Os coeficientes abaixo devem ser aplicados **APENAS** à Carga Móvel ($M_q$, $V_q$). Nunca aplicar ao peso próprio ou carga permanente.

### 2.1 Coeficiente de Impacto Vertical (CIV)
O efeito dinâmico vertical é calculado em função do vão ($L_{iv}$) da estrutura [9, 10]:

*   Se $L_{iv} < 10.0m$:
    $$CIV = 1.35$$
*   Se $10.0m \le L_{iv} \le 200.0m$:
    $$CIV = 1 + 1.06 \cdot \left( \frac{20}{L_{iv} + 50} \right)$$

### 2.2 Coeficiente de Impacto Adicional (CIA)
Majoração devido a irregularidades na pista/trilho. Para obras de concreto:
*   $$CIA = 1.25$$ [11].

### 2.3 Cálculo da Carga Móvel Vertical de Projeto ($Q_{vertical}$)
A carga estática da roda ($P_{estatica}$) importada do software deve ser majorada por:
$$Q_{vertical} = P_{estatica} \cdot CIV \cdot CIA$$
*(Nota: O CNF - Coeficiente de Número de Faixas é considerado 1.0 para viga de rolamento simples, salvo indicação contrária)* [12, 13].

---

## 3. Combinações de Ações (NBR 8681:2003 / NBR 6118:2023)

**Referência:** LOGICA_COMBINACOES.md

### 3.1 Estado Limite Último (ELU) - Combinação Normal
Verificação da ruptura ou colapso.
$$F_d = \gamma_{g} \cdot F_{g,k} + \gamma_{q} \cdot F_{q,k}$$
*   $\gamma_{g}$ (Permanente): 1.40 [14].
*   $\gamma_{q}$ (Variável Móvel): 1.40 [14].
*   Fórmula Prática:
    $$M_{d} = 1.4 \cdot M_{g} + 1.4 \cdot (M_{q,k} \cdot CIV \cdot CIA \cdot CNF)$$
    *(CNF = 1.0 para viga de rolamento simples)*

### 3.2 Estado Limite de Serviço (ELS-DEF) - Combinação Quase Permanente
Para verificação de deformação excessiva (flechas com fluência).
$$F_{d,ser} = F_{g,k} + \psi_2 \cdot F_{q,k}$$
*   $\psi_2$ (Ponte Rolante): **0.50** [15].

### 3.3 Estado Limite de Serviço (ELS-W) - Combinação Frequente
Para verificação de abertura de fissuras.
$$F_{d,fis} = F_{g,k} + \psi_1 \cdot F_{q,k}$$
*   $\psi_1$ (Ponte Rolante): **0.80** (NBR 8681 Tab. 6).

### 3.4 Estado Limite de Fadiga (ELS-Fad)
Para verificação de vida útil sob cargas cíclicas.
$$M_{fad,max} = M_{g,k} + 1.0 \cdot M_{q,max} \cdot CIV \cdot CIA$$
$$M_{fad,min} = M_{g,k} + 1.0 \cdot M_{q,min} \cdot CIV \cdot CIA$$
$$\Delta M = M_{fad,max} - M_{fad,min}$$
*   Coeficiente: 1.00 (Variação total da carga móvel conforme NBR 6118:2023 Item 23.5.2) [16].

---

## 4. Verificações de Segurança (NBR 6118:2023)

### 4.1 Flexão Simples (ELU)
*   **Domínios de Deformação:** Respeitar limites dos domínios 2, 3 e 4 [17].
*   **Posição da Linha Neutra ($x/d$):**
    *   Concretos $f_{ck} \le 50$ MPa: $x/d \le 0.45$ [18].
*   **Armadura Mínima ($\rho_{min}$):**
    *   Tabela 17.3 da NBR 6118 [19]. Para C30, $\rho_{min} \approx 0.150\%$.

### 4.2 Cisalhamento (Modelo I)
*   **Resistência da Biela Comprimida ($V_{Rd2}$):**
    $$V_{Rd2} = 0.27 \cdot (1 - \frac{f_{ck}}{250}) \cdot f_{cd} \cdot b_w \cdot d$$ [20].
*   **Parcela do Concreto ($V_{c0}$):**
    $$V_{c0} = 0.6 \cdot f_{ctd} \cdot b_w \cdot d$$ [21].
    *   Onde $f_{ctd} = f_{ctk,inf} / \gamma_c$.

### 4.3 Fissuração (ELS-W)
*   **Abertura Limite ($w_{lim}$):**
    *   CAA I: 0.4 mm
    *   CAA II e III: 0.3 mm
    *   CAA IV: 0.2 mm
    (Tabela 13.4 da NBR 6118) [22].