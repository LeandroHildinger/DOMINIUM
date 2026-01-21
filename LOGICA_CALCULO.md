# Motor de Cálculo: DOMINIUM (Regras e Algoritmos)
**Referência Normativa Principal:** ABNT NBR 6118:2023 e NBR 7188 (Cargas Móveis)

Este documento descreve a sequência exata de equações que o backend/javascript do aplicativo deve executar. O sistema deve tratar todas as unidades internamente em **kN** (força) e **cm** (comprimento), convertendo apenas para exibição (MPa, mm) quando necessário.

---

## 1. Dados de Entrada (Inputs)
O algoritmo recebe um objeto `Data` contendo:
*   **Geometria:** $b_w$ (alma), $h$ (altura), $b_f$ (mesa), $h_f$ (altura mesa), $d$ (altura útil), $d'$ (cobrimento efetivo).
    *   *Nota:* Se a seção for retangular, $b_f = b_w$ e $h_f = 0$.
*   **Materiais:** $f_{ck}$ (MPa), $f_{yk}$ (MPa), $E_s$ (GPa).
*   **Esforços Característicos (Envoltória):**
    *   $M_{g,k}$ (Momento Permanente)
    *   $M_{q,k}$ (Momento Móvel Máximo e Mínimo)
    *   $V_{g,k}$ (Cortante Permanente)
    *   $V_{q,k}$ (Cortante Móvel)

---

## 2. Passo 1: Propriedades dos Materiais (ELU)
Calcular as resistências de cálculo conforme NBR 6118 [1, 2].

1.  **Concreto:**
    $$f_{cd} = \frac{f_{ck}}{1.4}$$
    $$\lambda = 0.80 \quad (\text{para } f_{ck} \le 50 \text{MPa})$$
    $$\alpha_c = 0.85 \quad (\text{Fator de redução de resistência})$$
    $$\sigma_{cd} = \alpha_c \cdot f_{cd}$$

2.  **Aço (Armadura Passiva):**
    $$f_{yd} = \frac{f_{yk}}{1.15}$$
    $$\epsilon_{yd} = \frac{f_{yd}}{E_s} \quad (\text{Deformação de escoamento})$$

---

## 3. Passo 2: Flexão no Estado Limite Último (ELU)
O objetivo é encontrar a Linha Neutra ($x$) e a Área de Aço ($A_s$).

### 3.1 Definição do Momento de Cálculo ($M_d$)
Majorar as cargas conforme combinação normal:
$$M_d = 1.4 \cdot M_{g,k} + 1.4 \cdot M_{q,k}$$
*(Nota: O app deve verificar se o momento é positivo ou negativo para saber se a mesa está comprimida ou tracionada).*

### 3.2 Verificação de Seção T (Mesa Comprimida)
Verificar se a linha neutra fictícia cai na mesa ou na alma [3, 4].
Calcula-se o momento resistente máximo da mesa ($M_{R,mesa}$):
$$M_{R,mesa} = (b_f - b_w) \cdot h_f \cdot \sigma_{cd} \cdot (d - 0.5 h_f)$$

*   **CASO A:** Se $M_d \le M_{R,mesa}$ ou Seção Retangular:
    *   A linha neutra está na mesa. Calcula-se como seção retangular de largura $b = b_f$.
*   **CASO B:** Se $M_d > M_{R,mesa}$:
    *   A linha neutra está na alma. A mesa funciona como um "banzo" comprimido adicional. O momento restante vai para a alma.

### 3.3 Cálculo da Linha Neutra ($x$) - Equação Geral
Usando a simplificação do bloco retangular ($\lambda x$):
$$M_d = 0.68 \cdot b_w \cdot x \cdot f_{cd} \cdot (d - 0.4x)$$
Resolvendo a equação quadrática para $x$ [5, 6]:
$$x = \frac{d - \sqrt{d^2 - \frac{M_d}{0.34 \cdot b_w \cdot f_{cd}}}}{0.8}$$

### 3.4 Verificação de Domínios e Ductilidade
Com o valor de $x$, calcula-se a posição relativa $\xi = x/d$ e verifica-se o domínio [7, 8]:

*   **Domínio 2:** $x/d < 0.259$ (Aço escoa, Concreto não esmaga).
*   **Domínio 3:** $0.259 \le x/d \le 0.628$ (Aço escoa, Concreto esmaga).
*   **Domínio 4:** $x/d > 0.628$ (Aço não escoa - Ruptura Frágil).

**CRITÉRIO DE PARADA (NBR 6118):**
Para garantir ductilidade em vigas:
*   Se $x/d \le 0.45$: **OK (Verde)**.
*   Se $x/d > 0.45$: **ALERTA (Vermelho)** - "Seção Superarmada/Frágil". Sugerir armadura dupla ou aumentar altura.

### 3.5 Cálculo da Armadura ($A_s$)
$$z = d - 0.4x \quad (\text{Braço de alavanca})$$
$$A_s = \frac{M_d}{f_{yd} \cdot z}$$

---

## 4. Passo 3: Cisalhamento (Força Cortante)
Verificação simplificada pelo Modelo I da NBR 6118 (Biela a 45º) [9].

1.  **Verificação da Biela Comprimida ($V_{Rd2}$):**
    $$V_{Rd2} = 0.27 \cdot (1 - \frac{f_{ck}}{250}) \cdot f_{cd} \cdot b_w \cdot d$$
    *   Se $V_{Sd} > V_{Rd2}$: **FALHA (Esmagamento da biela).** Aumentar seção ou fck.

2.  **Cálculo da Armadura Transversal ($V_{sw}$):**
    Parcela resistida pelo concreto ($V_c$):
    $$V_{c} = 0.6 \cdot f_{ctd} \cdot b_w \cdot d$$
    Força a ser resistida pelo aço ($V_{sw}$):
    $$V_{sw} = V_{Sd} - V_c$$
    Área de estribos ($A_{sw}/s$):
    $$\frac{A_{sw}}{s} = \frac{V_{sw}}{0.9 \cdot d \cdot f_{yd}}$$

---

## 5. Passo 4: FADIGA (Crítico para Pontes)
Verificação da variação de tensão na armadura longitudinal [10, 11].

1.  **Combinacao de Fadiga (Pontes Rolantes):**
    Conforme NBR 6118:2023 Item 23.5.2 e LOGICA_COMBINACOES.md:
    $$\\psi_{fad} = 1.0 \\quad (\\text{Variacao total da carga movel})$$
    $$M_{max} = M_{g,k} + 1.0 \\cdot M_{q,max} \\cdot CIV \\cdot CIA$$
    $$M_{min} = M_{g,k} + 1.0 \\cdot M_{q,min} \\cdot CIV \\cdot CIA$$

2.  **Cálculo de Tensões no Estádio II (Seção Fissurada):**
    Não usar $f_{yd}$. Deve-se calcular a tensão real na barra usando a Lei de Hooke e a geometria fissurada.
    *   Encontrar linha neutra no Estádio II ($x_{II}$) resolvendo o momento estático [12, 13].
    *   Calcular Inércia Fissurada ($I_{II}$).
    *   Tensão máxima e mínima no aço:
        $$\sigma_{s,max} = n \cdot \frac{M_{max} \cdot (d - x_{II})}{I_{II}}$$
        $$\sigma_{s,min} = n \cdot \frac{M_{min} \cdot (d - x_{II})}{I_{II}}$$
        *(Onde $n = E_s / E_c \approx 10$)*.

3.  **Verificação:**
    $$\Delta \sigma_s = \sigma_{s,max} - \sigma_{s,min}$$
    *   Se $\Delta \sigma_s \le 190 \text{ MPa}$: **OK**.
    *   Caso contrário: **FALHA POR FADIGA**.

---

## 6. Passo 5: ELS - Fissuração e Flecha
Verificações de serviço para durabilidade e conforto.

1.  **Abertura de Fissuras ($w_k$):**
    Utilizar a tensão $\sigma_{s,max}$ calculada no passo da Fadiga.
    $$w_k = \frac{\phi}{12.5 \eta} \cdot \frac{\sigma_{s,max}}{E_s} \cdot \frac{3 \sigma_{s,max}}{f_{ctm}}$$
    *   Limite: $w_k \le 0.2 \text{ mm}$ (ou conforme classe de agressividade) [14, 15].

2.  **Flecha (Rigidez Equivalente):**
    Calcular a rigidez de Branson ($EI_{eq}$) considerando o momento máximo do vão ($M_{a}$) [16, 17]:
    $$EI_{eq} = E_{cs} \cdot \left[ \left(\frac{M_r}{M_a}\right)^3 \cdot I_c + \left[1 - \left(\frac{M_r}{M_a}\right)^3\right] \cdot I_{II} \right]$$
    *   Onde $M_r$ é o momento de fissuração.
    *   Usar este $EI_{eq}$ para calcular o deslocamento elástico e multiplicar por $(1+\alpha_f)$ para fluência.