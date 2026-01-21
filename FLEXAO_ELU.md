# Lógica de Cálculo - Passo 2: FLEXÃO NO ESTADO LIMITE ÚLTIMO (ELU)
**Referência Normativa:** ABNT NBR 6118:2023 (Itens 17.2 e 14.6.4.3)
**Objetivo:** Calcular a posição da Linha Neutra ($x$), identificar o Domínio de Deformação e determinar a área de armadura longitudinal de tração ($A_s$).

---

## 2.1 Entradas (Inputs)
Recuperar do objeto `InputData` e `MaterialProps`:
*   **Esforços:** $M_{d}$ (Momento de cálculo máximo na seção, em kN.cm).
    *   *Nota:* $M_d = \gamma_f \cdot M_k$. Se o input for característica, multiplicar por 1.4.
*   **Geometria:**
    *   $b_w$: Largura da alma (cm).
    *   $b_f$: Largura da mesa colaborante (cm). (Se Retangular, $b_f = b_w$).
    *   $h_f$: Espessura da mesa (cm). (Se Retangular, $h_f = 0$).
    *   $d$: Altura útil (cm).
*   **Materiais (do Passo 1):**
    *   $f_{cd}$, $\sigma_{cd}$ (Tensão no bloco: $\alpha_c \cdot f_{cd}$), $\lambda$, $\epsilon_{cu}$, $f_{yd}$, $\epsilon_{yd}$.

---

## 2.2 Algoritmo: Verificação de Seção T (Mesa Comprimida)

O algoritmo deve primeiro testar se a seção se comporta como retangular ou como T verdadeira.

### A. Hipótese 1: Linha Neutra na Mesa (Comportamento Retangular)
Assumimos inicialmente que a zona comprimida está inteiramente na mesa ($y \le h_f$). Calculamos como se fosse uma viga retangular de largura $b = b_f$.

**Equação de Equilíbrio (Momento):**
$$M_d = \lambda \cdot x \cdot b_f \cdot \sigma_{cd} \cdot (d - 0.5 \cdot \lambda \cdot x)$$

**Resolução para $x$ (Linha Neutra Tentativa):**
Esta é uma equação quadrática $Ax^2 + Bx + C = 0$.
*   $A = 0.5 \cdot \lambda^2 \cdot b_f \cdot \sigma_{cd}$
*   $B = - \lambda \cdot b_f \cdot \sigma_{cd} \cdot d$
*   $C = M_d$

$$x_{tentativa} = \frac{-B - \sqrt{B^2 - 4 \cdot A \cdot C}}{2 \cdot A}$$

### B. Teste de Validade (O "Flange Breaker")
Calculamos a altura do bloco comprimido: $y = \lambda \cdot x_{tentativa}$.

*   **SE** $y \le h_f$ (ou se a seção for puramente Retangular):
    *   **A hipótese é verdadeira.**
    *   $x_{final} = x_{tentativa}$.
    *   O cálculo de $A_s$ segue como seção retangular simples.
*   **SE** $y > h_f$ (Linha neutra corta a alma):
    *   **A hipótese é falsa.** A seção é uma **Viga T Verdadeira**.
    *   Deve-se acionar a sub-rotina de decomposição de esforços (Item 2.3 abaixo).

---

## 2.3 Algoritmo: Decomposição da Seção T (Se necessário)
*Executar apenas se $y > h_f$. Fonte: UNESP - Flexão Normal Simples, Item 9.2.2.*

A resistência é dividida em duas partes: as abas (mesas) e a alma.

1.  **Parcela 1: Resistência das Abas ($M_{d,aba}$)**
    As abas laterais estão totalmente comprimidas.
    *   Área das abas: $A_{c,aba} = (b_f - b_w) \cdot h_f$
    *   Força nas abas: $R_{c,aba} = A_{c,aba} \cdot \sigma_{cd}$
    *   Braço de alavanca: $z_{aba} = d - 0.5 \cdot h_f$
    *   Momento resistido pelas abas:
        $$M_{d,aba} = R_{c,aba} \cdot z_{aba}$$
    *   Armadura necessária para as abas:
        $$A_{s,aba} = \frac{M_{d,aba}}{f_{yd}}$$

2.  **Parcela 2: Resistência da Alma ($M_{d,alma}$)**
    O restante do momento deve ser absorvido pela alma (largura $b_w$).
    *   Momento restante: $M_{d,restante} = M_d - M_{d,aba}$
    *   Recalcular a Linha Neutra ($x$) usando a equação quadrática do item 2.2.A, mas agora usando **$b_w$** no lugar de $b_f$ e **$M_{d,restante}$** no lugar de $M_d$.
    *   Este novo $x$ será o $x_{final}$ da seção.

---

## 2.4 Verificação de Domínios e Ductilidade (Crucial para o App)

Com o $x_{final}$ determinado, calculamos a posição relativa da linha neutra:
$$\xi = \frac{x_{final}}{d}$$

O aplicativo deve classificar o resultado em um dos "semáforos" abaixo:

### A. Verificação Normativa (Limite de Ductilidade)
*   **Limite Máximo ($\xi_{lim}$):**
    *   Concreto até C50: $\xi_{lim} = 0.45$
    *   Concreto C55-C90: $\xi_{lim} = 0.35$

**Condicional:**
*   **SE** $\xi \le \xi_{lim}$: **OK (Dúctil)**. Prosseguir para cálculo de armadura.
*   **SE** $\xi > \xi_{lim}$: **NÃO CONFORME (Frágil / Superarmada)**.
    *   *Ação do App:* Emitir alerta vermelho. "Aumente a altura da viga ($h$) ou a resistência do concreto ($f_{ck}$)".
    *   *Nota Didática:* Não calcular armadura dupla neste MVP para não complicar. Bloquear o cálculo e pedir revisão da geometria.

### B. Classificação do Domínio (Visualização)
Para plotar no gráfico interativo:
1.  Calcular deformação do aço ($\epsilon_s$) assumindo $\epsilon_c = \epsilon_{cu}$ (3.5‰):
    $$\epsilon_s = \frac{\epsilon_{cu} \cdot (d - x)}{x}$$
2.  Classificar:
    *   **Domínio 2:** $\epsilon_s \ge 10‰$ (Aço escoa muito, concreto não esmaga).
    *   **Domínio 3:** $\epsilon_{yd} \le \epsilon_s < 10‰$ (Situação ideal: Concreto e aço falham juntos).
    *   **Domínio 4:** $\epsilon_s < \epsilon_{yd}$ (Aço não escoa. Ruptura frágil).

---

## 2.5 Cálculo da Armadura Longitudinal ($A_s$)

Se passou no teste de ductilidade (Item 2.4.A), calcular a área de aço final.

### Caso Retangular (ou T que age como Retangular):
$$z = d - 0.5 \cdot \lambda \cdot x_{final}$$
$$A_s = \frac{M_d}{f_{yd} \cdot z}$$

### Caso T Verdadeiro (Alma + Abas):
Calcular armadura da alma usando o $M_{d,restante}$:
$$z_{alma} = d - 0.5 \cdot \lambda \cdot x_{final}$$
$$A_{s,alma} = \frac{M_{d,restante}}{f_{yd} \cdot z_{alma}}$$
$$A_{s,total} = A_{s,alma} + A_{s,aba}$$

### Verificação de Armadura Mínima ($A_{s,min}$)
Conforme NBR 6118 (Tabela 17.3.5.1):
$$\rho_{min} = \frac{A_{s,min}}{A_c} \ge 0.15\% \text{ (varia com fck)}$$
*   Se $A_{s,calculado} < A_{s,min}$, adotar $A_{s,min}$.

---

## 2.6 Saída do Módulo (Output Object)

```json
{
  "results_ELU_Flexao": {
    "Md_calc": 45000,       // kN.cm
    "x_final": 15.4,        // cm
    "beta_x": 0.32,         // x/d
    "z_braço": 42.1,        // cm
    "dominio": "3",         // String: "2", "3", "4"
    "status_ductilidade": "OK", // ou "FALHA - Seção Superarmada"
    "tipo_secao": "T - Mesa Comprimida", // ou "Retangular"
    "As_calculado": 12.5,   // cm²
    "As_min": 3.2,          // cm²
    "As_final": 12.5,       // cm²
    "deformacoes": {
      "eps_c": 3.5,         // por mil
      "eps_s": 4.2          // por mil
    }
  }
}