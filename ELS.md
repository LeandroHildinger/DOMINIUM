# Lógica de Cálculo - Passo 5: ESTADOS LIMITES DE SERVIÇO (ELS)
**Referência Normativa:** ABNT NBR 6118:2023 (Seções 13, 17.3 e 19.3)
**Objetivo:** Verificar a abertura de fissuras ($w_k$) e o deslocamento vertical máximo (flecha), considerando a não linearidade física (fissuração do concreto) e a fluência (efeito do tempo).

---

## 5.1 Entradas (Inputs)
Recuperar do objeto `InputData`, `MaterialProps` e passos anteriores:
*   **Geometria:** $b_w, h, d, A_s$ (Armadura tracionada calculada no ELU), $A'_s$ (Armadura comprimida/porta-estribos).
*   **Materiais:** $f_{ck}$, $f_{ctm}$ (Resistência média à tração - ver Passo 1), $E_s$.
*   **Esforços de Serviço (Input do Excel processado):**
    *   $M_{ser,freq}$: Momento da combinação Frequente (Para Fissuração).
    *   $M_{ser,qp}$: Momento da combinação Quase Permanente (Para Flecha/Fluência).
*   **Parâmetros de Serviço:**
    *   `t_meses`: Tempo para verificação da flecha diferida (Default: 70 meses para flecha final).
    *   `tipo_agregado`: Basalto/Diabásio (1.2), Granito/Gneisse (1.0), Calcário (0.9), Arenito (0.7).

---

## 5.2 Algoritmo: Rigidez do Material (Módulo de Elasticidade)
*Atenção: A NBR 6118:2023 alterou a fórmula do módulo secante ($E_{cs}$)* [Fonte 155, 156, 464].

1.  **Módulo Tangente Inicial ($E_{ci}$):**
    *   Se $f_{ck} \le 50$ MPa:
        $$ E_{ci} = \alpha_E \cdot 5600 \cdot \sqrt{f_{ck}} $$
    *   Se $f_{ck} > 50$ MPa:
        $$ E_{ci} = 21.5 \cdot 10^3 \cdot \alpha_E \cdot (f_{ck}/10 + 1.25)^{1/3} $$
    *(Resultado em MPa. Converter para kN/cm² dividindo por 10 para compatibilidade com inércia em cm⁴)*.

2.  **Módulo Secante ($E_{cs}$):**
    Usado nas verificações de serviço.
    $$ \alpha_i = 0.8 + 0.2 \cdot \frac{f_{ck}}{80} \le 1.0 $$
    $$ E_{cs} = \alpha_i \cdot E_{ci} $$
    *   *Coeficiente de equivalência aço/concreto:* $\alpha_e = E_s / E_{cs}$.

---

## 5.3 Algoritmo: Momento de Fissuração ($M_r$)
Determina se a seção entra no Estádio II (fissurada).

1.  **Inércia Bruta ($I_c$) e $y_t$:**
    Para seção retangular: $I_c = (b_w \cdot h^3) / 12$ e $y_t = h/2$.
    *(Para seção T, calcular o centro de gravidade real da seção homogeneizada bruta)*.

2.  **Cálculo de $M_r$:**
    $$ M_r = \frac{\alpha \cdot f_{ctm} \cdot I_c}{y_t} $$
    *   $\alpha = 1.5$ (Seção Retangular).
    *   $\alpha = 1.2$ (Seção T ou Duplo T).
    *[Fonte 408].*

---

## 5.4 Algoritmo: Propriedades do Estádio II (Seção Fissurada)
Necessário se $M_{solicitante} > M_r$.

1.  **Linha Neutra no Estádio II ($x_{II}$):**
    Resolver equação do momento estático (considerando $A_s$ e $A'_s$ transformados por $\alpha_e$).
    $$ \frac{b_w \cdot x_{II}^2}{2} + \alpha_e A'_s (x_{II} - d') = \alpha_e A_s (d - x_{II}) $$
    *(Se Seção T com $x_{II} > h_f$, ajustar área comprimida).*

2.  **Inércia Fissurada ($I_{II}$):**
    $$ I_{II} = \frac{b_w \cdot x_{II}^3}{3} + \alpha_e A'_s (x_{II} - d')^2 + \alpha_e A_s (d - x_{II})^2 $$
    *[Fonte 419, 420, 462].*

---

## 5.5 Algoritmo: Verificação de Fissuração ($w_k$)
Usar Combinação Frequente ($M_{ser,freq}$).

1.  **Tensão na Armadura ($\sigma_{si}$):**
    $$ \sigma_{si} = \alpha_e \cdot \frac{M_{ser,freq} \cdot (d - x_{II})}{I_{II}} $$

2.  **Cálculo da Abertura ($w_k$):**
    Calcular dois valores ($w_1, w_2$) e adotar o menor [Fonte 229, 454].
    *   **Fórmula 1:**
        $$ w_1 = \frac{\phi_i}{12.5 \cdot \eta_1} \cdot \frac{\sigma_{si}}{E_s} \cdot \frac{3 \sigma_{si}}{f_{ctm}} $$
    *   **Fórmula 2:**
        $$ w_2 = \frac{\phi_i}{12.5 \cdot \eta_1} \cdot \frac{\sigma_{si}}{E_s} \cdot \left( \frac{4}{\rho_{ri}} + 45 \right) $$
    *   *Onde:*
        *   $\phi_i$: Diâmetro da barra (mm).
        *   $\eta_1$: Coeficiente de aderência (2.25 para barras nervuradas).
        *   $\rho_{ri}$: Taxa de armadura na região de envolvimento ($A_s / A_{c,ri}$).

3.  **Checagem:**
    *   **SE** $w_k \le w_{lim}$ (0.2mm a 0.4mm conf. classe de agressividade): **OK**.
    *   **SE** $w_k > w_{lim}$: **NOK**. Sugerir: "Aumentar número de barras (diminuir diâmetro) ou aumentar a altura da viga".

---

## 5.6 Algoritmo: Verificação de Flecha (Deformação)
Usar Combinação Quase Permanente ($M_{a} = M_{ser,qp}$).

### A. Rigidez Equivalente de Branson ($EI_{eq}$)
A rigidez da viga é uma média ponderada entre o estado íntegro (I) e fissurado (II), dependendo do nível de carga [Fonte 221, 421].

$$ EI_{eq} = E_{cs} \cdot I_c \cdot \left(\frac{M_r}{M_a}\right)^3 + E_{cs} \cdot I_{II} \cdot \left[1 - \left(\frac{M_r}{M_a}\right)^3\right] $$
*   **Condição:** Se $M_a < M_r$, então $EI_{eq} = E_{cs} \cdot I_c$.
*   **Nota NBR 6118:2023:** Para vigas contínuas, usar a média ponderada das rigidezes nos apoios e no vão (Figura 17.3 da norma). Para viga biapoiada (MVP), usar o valor no meio do vão é aceitável e a favor da segurança.

### B. Flecha Imediata (Elástica) - $f_0$
Calcular usando a fórmula da linha elástica clássica com a rigidez $EI_{eq}$.
*   Para carga distribuída uniforme ($q$) em viga biapoiada:
    $$ f_0 = \frac{5}{384} \cdot \frac{q_{qp} \cdot L^4}{EI_{eq}} $$
    *(Lembrar de converter unidades: L em cm, q em kN/cm, EI em kN.cm²)*.

### C. Flecha Diferida (Fluência) - $f_{total}$
O concreto deforma com o tempo. A flecha final é a imediata multiplicada por um fator $(1 + \alpha_f)$ [Fonte 224, 428].

1.  **Cálculo do fator $\alpha_f$:**
    $$ \Delta \xi = \xi(t) - \xi(t_0) $$
    $$ \alpha_f = \frac{\Delta \xi}{1 + 50 \rho'} $$
    *   $\xi(t)$: Coeficiente de tempo (Tabela 17.1 da norma). Para $t \ge 70$ meses, $\xi = 2.0$.
    *   $\xi(t_0)$: Para $t_0 \approx 1$ mês (retirada escoramento), $\xi \approx 0.68$. Logo $\Delta \xi \approx 1.32$.
    *   $\rho'$: Taxa de armadura de compressão ($A'_s / (b \cdot d)$). *Aqui entra a importância da armadura porta-estribos na redução da flecha de longo prazo!*

2.  **Flecha Total:**
    $$ f_{total} = f_0 \cdot (1 + \alpha_f) $$

3.  **Contraflecha (Opcional no App):**
    O usuário pode informar uma contraflecha ($f_c$) para abater.
    $$ f_{final} = f_{total} - f_c $$

4.  **Checagem (Limites NBR 6118 Tabela 13.3):**
    *   **Aceitabilidade Visual:** $f_{total} \le L/250$.
    *   **Vibrações/Conforto:** $f_{total} \le L/350$.
    *   **Danos em Alvenaria:** A parcela da flecha que ocorre *após* a construção da parede deve ser $\le L/500$ ou 10mm [Fonte 431, 432].

---

## 5.7 Saída do Módulo (Output Object)

```json
{
  "results_ELS": {
    "material": {
      "Eci": 3680,       // kN/cm²
      "Ecs": 3220,       // kN/cm² (Secante)
      "alpha_e": 6.52    // Razão modular
    },
    "fissuracao": {
      "Mr_momento_fissuracao": 4500, // kN.cm
      "M_freq_atuante": 5200,        // kN.cm
      "estado": "Estádio II",
      "wk_calculado": 0.18,          // mm
      "wk_limite": 0.30,             // mm
      "status": "OK"
    },
    "flecha": {
      "Inercia_bruta": 540000,       // cm4
      "Inercia_fissurada": 180000,   // cm4
      "EI_equivalente": 950000000,   // kN.cm² (Branson)
      "flecha_imediata": 1.2,        // cm
      "alpha_f_fluencia": 1.15,      // Fator multiplicador
      "flecha_total": 2.58,          // cm (1.2 * (1+1.15))
      "limite_norma": 3.00,          // cm (L/250)
      "status": "OK"
    }
  }
}