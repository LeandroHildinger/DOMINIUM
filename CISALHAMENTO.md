# Lógica de Cálculo - CISALHAMENTO (ELU + FADIGA)
**Referência Normativa:** ABNT NBR 6118:2023 (Item 17.4.2 - Modelo I, Item 23.5.5 - Fadiga)

Este documento define as regras definitivas para verificação de cisalhamento. O código deve seguir estritamente estas equações.

---

## 1. Parâmetros de Entrada
*   **Geometria:** $b_w$, $d$, $h$.
*   **Materiais:** $f_{ck}$, $f_{yk}$, $f_{ctk,inf}$.
*   **Esforços:**
    *   $V_{Sd}$ (Cortante de Cálculo Máximo - ELU).
    *   $V_{max,fad}$ e $V_{min,fad}$ (Cortantes para verificação de fadiga).

---

## 2. Verificação da Biela Comprimida (ELU - Ruptura)
Modelo de Cálculo I ($\theta = 45^\circ$).

### 2.1 Coeficiente de Redução ($\alpha_{v2}$)
Devido à fissuração diagonal, a resistência do concreto na biela é menor:
$$ \alpha_{v2} = 1 - \frac{f_{ck}}{250} $$
*(Nota: $f_{ck}$ em MPa)*

### 2.2 Resistência da Biela ($V_{Rd2}$)
$$ V_{Rd2} = 0.27 \cdot \alpha_{v2} \cdot f_{cd} \cdot b_w \cdot d $$
*(Usar $f_{cd}$ em kN/cm² e geometria em cm para obter kN)*

### 2.3 Verificação
*   **SE** $V_{Sd} \le V_{Rd2}$: **OK**. Prosseguir para cálculo da armadura.
*   **SE** $V_{Sd} > V_{Rd2}$: **FALHA (Esmagamento da Biela)**. Aumentar $b_w$, $h$ ou $f_{ck}$.

---

## 3. Cálculo da Armadura Transversal (ELU - Estático)

### 3.1 Parcela Resistida pelo Concreto ($V_{c0}$)
$$ f_{ctd} = \frac{0.21 \cdot f_{ck}^{2/3}}{1.4} $$
$$ V_{c0} = 0.6 \cdot f_{ctd} \cdot b_w \cdot d $$

### 3.2 Força a ser Resistida pelo Aço ($V_{sw}$)
$$ V_{sw} = V_{Sd} - V_{c0} $$
*   Se $V_{sw} < 0$, adotar $V_{sw} = 0$.

### 3.3 Área de Aço Necessária ($A_{sw,calc}$)
Para estribos verticais ($\alpha = 90°$), com $f_{ywd} \le 435$ MPa:
$$ A_{sw,calc} = \frac{V_{sw}}{0.9 \cdot d \cdot 435} \times 100 \quad (cm^2/m) $$

### 3.4 Armadura Mínima ($A_{sw,min}$)
$$ f_{ct,m} = 0.3 \cdot f_{ck}^{2/3} \quad (\text{para } f_{ck} \le 50) $$
$$ \rho_{sw,min} = 0.2 \cdot \frac{f_{ct,m}}{f_{ywk}} $$
$$ A_{sw,min} = \rho_{sw,min} \cdot b_w \times 100 \quad (cm^2/m) $$

### 3.5 Resultado ELU
$$ A_{sw,final} = \max(A_{sw,calc}, A_{sw,min}) $$

---

## 4. Verificação de Fadiga (OBRIGATÓRIO para Ponte Rolante)
**Referência:** NBR 6118 Item 23.5.5.

> **IMPORTANTE:** Esta verificação frequentemente governa em vigas de rolamento!

### 4.1 Redutor de Fadiga do Concreto (NBR 6118 Item 23.5.5 - Nota)
Para o Modelo I, a contribuição do concreto na fadiga é reduzida em 50%:
$$ V_{c,fad} = 0.5 \cdot V_{c0} $$

> **Fundamentação Normativa:** *"O critério... equivale a adotar, para $10^7$ ciclos, 50% da resistência à tração estática. Isso corresponde a reduzir o valor $V_c$ de 50% do seu valor estático no caso do Modelo I."*

### 4.2 Variação de Força no Estribo ($\Delta V_{sw}$)
$$ \Delta V = V_{max,fad} - V_{min,fad} $$
$$ \Delta V_{sw} = \Delta V - V_{c,fad} $$
*   Se $\Delta V < V_{c,fad}$, então $\Delta V_{sw} = 0$ (concreto absorve toda variação).

### 4.3 Variação de Tensão no Estribo ($\Delta \sigma_{sw}$)
Usando a armadura calculada no ELU ($A_{sw,final}$) e um espaçamento $s$ adotado:
$$ \Delta \sigma_{sw} = \frac{\Delta V_{sw}}{0.9 \cdot d \cdot (A_{sw}/s)} $$
*(Atenção às unidades: resultado em MPa)*

### 4.4 Verificação de Fadiga
Limite para estribos retos CA-50/CA-60 (Tabela 23.2 da NBR 6118):
$$ \Delta \sigma_{sw} \le 85 \text{ MPa} $$

*   **SE** $\Delta \sigma_{sw} \le 85$ MPa: **OK**.
*   **SE** $\Delta \sigma_{sw} > 85$ MPa: **FALHA POR FADIGA**.
    *   *Ação:* Aumentar $A_{sw}$ (diminuir espaçamento ou aumentar diâmetro) até atender.

---

## 5. Espaçamento Máximo dos Estribos ($s_{max}$)
Depende da intensidade da solicitação:

*   **SE** $V_{Sd} \le 0.67 \cdot V_{Rd2}$:
    $$ s_{max} = \min(0.6 \cdot d, 300 \text{ mm}) $$
*   **SE** $V_{Sd} > 0.67 \cdot V_{Rd2}$:
    $$ s_{max} = \min(0.3 \cdot d, 200 \text{ mm}) $$

---

## 6. Parâmetro de Decalagem ($a_l$) - NBR 6118:2023 (Item 17.4.2.2-c)
Para o Modelo I (estribos verticais, $\theta = 45°$), o deslocamento do diagrama de momentos é:

$$ a_l = 0,5 \cdot d \cdot \frac{V_{Sd,max}}{V_{Sd,max} - V_{c0}} $$

**Limites e Condições:**
*   **Limite Inferior:** $a_l \ge 0,5 \cdot d$ (sempre).
*   **Caso Especial:** Se $V_{Sd,max} \le V_{c0}$, adotar $a_l = 0,5 \cdot d$.

> **⚠️ ATENÇÃO:** A fórmula antiga ($a_l = 0,5d$) era simplificada. A NBR 6118:2023 penaliza vigas onde o cortante é elevado em relação à resistência do concreto, exigindo maior comprimento de ancoragem.

*Este valor deve ser exportado para o detalhamento da armadura longitudinal.*

---

## 7. Output do Script
Gerar um objeto estruturado contendo:
```json
{
  "ELU": {
    "V_sd": 200.0,
    "V_rd2": 840.0,
    "status_biela": "OK",
    "V_c0": 143.0,
    "V_sw": 57.0,
    "Asw_s_calc": 2.65,
    "Asw_s_min": 3.48,
    "Asw_s_final": 3.48,
    "s_max": 30.0
  },
  "FADIGA": {
    "V_max_fad": 180.0,
    "V_min_fad": 30.0,
    "V_c_fad": 71.5,
    "Delta_V_sw": 78.5,
    "Delta_sigma_sw": 42.3,
    "limite": 85.0,
    "status": "OK"
  },
  "al_decalagem": 27.5
}
```