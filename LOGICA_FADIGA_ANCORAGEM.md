# Lógica de Fadiga e Ancoragem (NBR 6118:2023)

Este módulo verifica a durabilidade sob ciclos repetidos (Fadiga - Seção 23) e o detalhamento de segurança (Ancoragem - Seção 9).

## 1. Verificação de Fadiga (ELU)
A fadiga degrada a resistência dos materiais. Verificação obrigatória para pontes rolantes.
Referência: NBR 6118 Itens 23.5.4 e 23.5.5 [2][4].

### 1.1 Parâmetros de Entrada
*   Esforços na Combinação Frequente de Fadiga: $M_{max}, M_{min}, V_{max}, V_{min}$.
*   Fator de segurança do concreto na fadiga: $\gamma_c = 1.4$ [3].
*   Fator de segurança do aço na fadiga: $\gamma_s = 1.0$ [3].

### 1.2 Fadiga da Armadura Longitudinal (Tração)
1.  Calcular a variação de tensão no aço ($\Delta \sigma_s$) no Estádio II (seção fissurada).
2.  **Verificação:** $\gamma_f \cdot \Delta \sigma_s \le \Delta f_{sd,fad}$
    *   Para barras retas (CA-50): Limite = **190 MPa** [4].
    *   Para barras dobradas/estribos ($D < 25\phi$): Limite = **85 MPa** [4].

### 1.3 Fadiga do Concreto (Compressão)
O concreto comprimido não pode exceder um limite reduzido de resistência de cálculo.
1.  Calcular a tensão máxima de compressão no concreto ($\sigma_{c,max}$) para $M_{max}$.
2.  **Limite de Resistência à Fadiga ($f_{cd,fad}$):**
    $$ f_{cd,fad} = 0,45 \cdot f_{cd} = 0,45 \cdot \frac{f_{ck}}{1.4} $$
    *(Nota: O uso de fcd é mandatório pela seção 23.5.4.1 da norma [2])*
3.  **Verificação:** $\sigma_{c,max} \le f_{cd,fad}$.

### 1.4 Fadiga do Concreto (Tração) - NBR 6118:2023 (Item 23.5.4.2)
Para definir se a seção trabalha no Estádio I (não fissurada) ou Estádio II (fissurada) sob cargas de fadiga:

1.  **Limite de Resistência à Tração na Fadiga:**
    $$ f_{ctd,fad} = 0,3 \cdot f_{ctd,inf} = 0,3 \cdot \frac{f_{ctk,inf}}{1,4} $$
    
2.  **Verificação:**
    *   Se tensão de tração $\sigma_{ct} \le f_{ctd,fad}$: Seção não fissurada (Estádio I).
    *   Se tensão de tração $\sigma_{ct} > f_{ctd,fad}$: Seção fissurada (Estádio II).

> **⚠️ CRÍTICO para Pontes Rolantes:** O redutor de 30% (0,3) é severo! Isso significa que a seção fissura sob fadiga muito antes do que o cálculo estático prevê. Sempre considerar Estádio II para verificação de fadiga da armadura longitudinal.

---

## 2. Cálculo de Ancoragem (NBR 6118 Seção 9)
Define o comprimento necessário ($l_b$) para transferir os esforços do aço para o concreto.

### 2.1 Tensão de Aderência ($f_{bd}$)
$$ f_{bd} = \eta_1 \cdot \eta_2 \cdot \eta_3 \cdot f_{ctd} $$
*   $\eta_1 = 2.25$ (Barras nervuradas CA-50) [5].
*   $\eta_2$: 1.0 (Boa aderência) ou 0.7 (Má aderência).
*   $\eta_3$: 1.0 ($\phi \le 32$mm).
*   $f_{ctd} = f_{ctk,inf} / 1.4$ [6].

### 2.2 Comprimento de Ancoragem Básico ($l_b$)
$$ l_b = \frac{\phi}{4} \cdot \frac{f_{yd}}{f_{bd}} $$

### 2.3 Comprimento de Ancoragem Necessário ($l_{b,nec}$)
$$ l_{b,nec} = \alpha \cdot l_{b} \cdot \frac{A_{s,calc}}{A_{s,efetiva}} \ge l_{b,min} $$
*   $\alpha = 1.0$ (Sem gancho) ou $0.7$ (Com gancho).
*   $l_{b,min} = \max(0.3 l_b, 10\phi, 100 \text{mm})$.