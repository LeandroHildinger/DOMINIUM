# Lógica de Combinações de Cargas (Motor de Cálculo)
**Referência Normativa:** NBR 8681:2003 (Ações), NBR 7188:2024 (Carga Móvel) e NBR 6118:2023.

Este documento define as fórmulas exatas para o processamento dos esforços. O código deve seguir estritamente estas equações.

## 1. Variáveis de Entrada (Do Excel SAP2000)
Para cada posição `x` da viga, ler:
*   `Mgk`: Momento da Carga Permanente (Dead + Trilho).
*   `Mqk_max`: Envoltória Máxima da Carga Móvel (Ponte Rolante).
*   `Mqk_min`: Envoltória Mínima da Carga Móvel (Ponte Rolante).
*   *(O mesmo se aplica para Cortantes V)*.

## 2. Parâmetros de Impacto (NBR 7188)
Aplicar **apenas** sobre os esforços móveis (`Mqk`, `Vqk`). Nunca sobre `Mgk`.

1.  **CIV (Coeficiente de Impacto Vertical):**
    *   Se Vão ($L$) < 10.0m: `CIV = 1.35`
    *   Se 10.0m <= $L$ <= 200.0m: `CIV = 1 + 1.06 * (20 / (L + 50))`
2.  **CIA (Coeficiente de Impacto Adicional):**
    *   `CIA = 1.25` (Valor para estruturas de concreto).
3.  **CNF (Coeficiente de Número de Faixas):**
    *   `CNF = 1.0` (Padrão para viga de rolamento simples).

**Esforço Móvel de Cálculo:**
`M_movel_dyn = Mqk * CIV * CIA * CNF`

## 3. Combinações de Cálculo (NBR 8681)

O sistema deve gerar 4 vetores de resultados. Utilize os coeficientes fixados abaixo:

### A. ELU Normal (Dimensionamento / Ruptura)
Combinação para cálculo de Armadura ($A_s$) e Cisalhamento.
*   **Coeficientes:**
    *   `Gamma_g` = 1.4
    *   `Gamma_q` = 1.4
*   **Fórmula (Máx):** `Md_elu_max = (1.4 * Mgk) + (1.4 * M_movel_dyn_max)`
*   **Fórmula (Mín):** `Md_elu_min = (1.4 * Mgk) + (1.4 * M_movel_dyn_min)`

### B. ELS-DEF (Flecha / Deformação Excessiva)
Combinação Quase Permanente.
*   **Coeficiente Psi_2:** `0.5` (Valor específico para Pontes Rolantes - NBR 8681 Tab. 6).
*   **Fórmula:** `Md_els_qp = (1.0 * Mgk) + (0.5 * M_movel_dyn_max)`
*   *Nota: Usar o valor máximo da móvel para ser conservador na flecha.*

### C. ELS-W (Abertura de Fissuras)
Combinação Frequente.
*   **Coeficiente Psi_1:** `0.8` (Valor específico para Pontes Rolantes - NBR 8681 Tab. 6).
*   **Fórmula:** `Md_els_freq = (1.0 * Mgk) + (0.8 * M_movel_dyn_max)`

### D. Fadiga (Variação de Tensão)
Verificação de vida útil (Armadura e Concreto).
*   **Coeficiente:** `1.0` (Considera-se a variação frequente da carga total).
*   **Fórmula Máx:** `M_fad_max = (1.0 * Mgk) + (1.0 * M_movel_dyn_max)`
*   **Fórmula Mín:** `M_fad_min = (1.0 * Mgk) + (1.0 * M_movel_dyn_min)`
*   **Output Necessário:** Calcular amplitude `Delta_M = M_fad_max - M_fad_min`.

## 4. Output do Script
Gerar um objeto/dicionário estruturado onde, para cada `x` (station), tenhamos acessíveis:
*   `ELU`: {max, min}
*   `ELS_FLECHA`: {val}
*   `ELS_FISSURA`: {val}
*   `FADIGA`: {max, min, delta}