# Lógica de Cálculo - Passo 4: VERIFICAÇÃO DE FADIGA
**Referência Normativa:** ABNT NBR 6118:2023 (Seção 23) e NBR 7188 (Cargas Móveis)
**Objetivo:** Verificar a segurança das armaduras (longitudinal e transversal) e do concreto sob a ação de cargas cíclicas (repetidas), calculando a amplitude de variação de tensão ($\Delta \sigma$).

---

## 4.1 Entradas (Inputs)
Recuperar do objeto `InputData` e das etapas anteriores:
*   **Geometria:** $b_w, h, d, b_f, h_f$ (Seção T).
*   **Materiais:** $f_{ck}, E_s, E_{cs}$ (Módulo secante do concreto).
*   **Esforços Característicos (Envoltória):**
    *   $M_{g,k}$ (Momento Permanente).
    *   $M_{q,max}$ e $M_{q,min}$ (Momentos Móveis Máximo e Mínimo - já com impacto CIV).
    *   $V_{g,k}$ (Cortante Permanente).
    *   $V_{q,max}$ e $V_{q,min}$ (Cortantes Móveis - já com impacto CIV).
*   **Configuracao de Fadiga (Conforme LOGICA_COMBINACOES.md):**
    *   Para Pontes Rolantes, usa-se a variacao total: $\psi_{fad} = 1.0$

---

## 4.2 Algoritmo: Combinação de Esforços (Frequente)
A fadiga é verificada usando a **Combinação Frequente de Serviço** ($F_{d,ser}$), não a combinação última [Fonte 354].

1.  **Calculo dos Momentos de Fadiga (Pontes Rolantes):**
    Conforme LOGICA_COMBINACOES.md, usa-se a variacao total (coef. = 1.0):
    $$ M_{max} = M_{g,k} + 1.0 \cdot M_{q,max} \cdot CIV \cdot CIA $$
    $$ M_{min} = M_{g,k} + 1.0 \cdot M_{q,min} \cdot CIV \cdot CIA $$
    *(Nota: CIV e CIA ja foram aplicados na etapa de processamento)*
    *(Nota: Se $M_{min}$ inverter o sinal, a verificação deve considerar a inversão de esforços, mas para vigas biapoiadas simples, geralmente $M_{min}$ é apenas "menos positivo" ou zero).*

2.  **Cálculo das Cortantes de Fadiga:**
    $$ V_{max} = V_{g,k} + \psi_1 \cdot V_{q,max} $$
    $$ V_{min} = V_{g,k} + \psi_1 \cdot V_{q,min} $$

---

## 4.3 Algoritmo: Propriedades da Seção no Estádio II (Fissurado)
Para a fadiga, o concreto à tração é desprezado. Deve-se calcular as propriedades geométricas da seção fissurada (Estádio II) assumindo comportamento linear elástico (Lei de Hooke).

### A. Razão Modular ($\alpha_e$)
$$ \alpha_e = \frac{E_s}{E_{cs}} $$
*(Geralmente adota-se $\alpha_e \approx 10$ para verificações de fadiga ou o valor calculado exato)* [Fonte 357].

### B. Linha Neutra no Estádio II ($x_{II}$)
Encontrar a profundidade da linha neutra igualando o momento estático da área comprimida com a área tracionada homogeneizada.

*   **Área de Aço ($A_s$):** Usar a área efetiva calculada no Passo 2 (ELU).
*   **Equação Genérica (Seção Retangular):**
    $$ \frac{b_w \cdot x_{II}^2}{2} = \alpha_e \cdot A_s \cdot (d - x_{II}) $$
    *   Resolver equação quadrática para $x_{II}$.
*   **Verificação de Seção T:**
    Se $x_{II} > h_f$ (linha neutra na alma), a equação muda para considerar as abas comprimidas:
    $$ \frac{b_w \cdot x_{II}^2}{2} + (b_f - b_w) \cdot h_f \cdot (x_{II} - \frac{h_f}{2}) = \alpha_e \cdot A_s \cdot (d - x_{II}) $$

### C. Momento de Inércia no Estádio II ($I_{II}$)
$$ I_{II} = \frac{b_w \cdot x_{II}^3}{3} + \alpha_e \cdot A_s \cdot (d - x_{II})^2 $$
*(Se Seção T com $x_{II} > h_f$, adicionar o termo das abas: $+ \frac{(b_f-b_w)h_f^3}{12} + (b_f-b_w)h_f(x_{II} - h_f/2)^2$)*.

---

## 4.4 Algoritmo: Fadiga da Armadura Longitudinal (Flexão)
Verificar se a oscilação de tensão no aço suporta o número de ciclos (geralmente $2 \cdot 10^6$).

1.  **Cálculo das Tensões no Aço ($ \sigma_s $):**
    Usar a fórmula da flexão composta no regime elástico:
    $$ \sigma_{s,max} = \alpha_e \cdot \frac{M_{max} \cdot (d - x_{II})}{I_{II}} $$
    $$ \sigma_{s,min} = \alpha_e \cdot \frac{M_{min} \cdot (d - x_{II})}{I_{II}} $$

2.  **Variação de Tensão ($\Delta \sigma_s$):**
    $$ \Delta \sigma_s = \sigma_{s,max} - \sigma_{s,min} $$

3.  **Verificação (Critério de Woeller - Tabela 23.2 NBR 6118):**
    Definir o limite $\Delta f_{sd,fad}$ com base no diâmetro da barra ($\phi$) e tipo de aço (CA-50).
    *   **Barras Retas:**
        *   Se $\phi \le 16$mm: Limite = 190 MPa.
        *   Se $\phi = 20$mm: Limite = 185 MPa.
        *   Se $\phi = 25$mm: Limite = 175 MPa.
    *   **Barras Dobradas/Estribos:** Limites são menores (ver item 4.6).

    **Condição de Segurança:**
    *   **SE** $\gamma_f \cdot \Delta \sigma_s \le \Delta f_{sd,fad}$: **OK**.
    *   **SE** $\gamma_f \cdot \Delta \sigma_s > \Delta f_{sd,fad}$: **FALHA POR FADIGA**.
    *(Nota: $\gamma_f = 1.0$ para fadiga conforme NBR 6118)* [Fonte 357].

---

## 4.5 Algoritmo: Fadiga do Concreto (Compressão)
Verificar se a tensão máxima no concreto comprimido não causa microfissuração excessiva.

1.  **Tensão Máxima no Concreto ($\sigma_{c,max}$):**
    $$ \sigma_{c,max} = \frac{M_{max} \cdot x_{II}}{I_{II}} $$

2.  **Verificação:**
    Conforme NBR 6118 Item 23.5.4.1.
    *   Limite Simplificado: $\sigma_{c,lim} = 0.45 \cdot f_{ck}$.
    *   **SE** $\sigma_{c,max} \le 0.45 f_{ck}$: **OK**.
    *   **Caso contrário:** Exige verificação precisa da tensão mínima/máxima ou aumento da seção.

---

## 4.6 Algoritmo: Fadiga da Armadura Transversal (Estribos)
Esta é a verificação crítica para vigas curtas e vigas de rolamento.

1.  **Redução da Contribuição do Concreto ($V_c$):**
    Na fadiga, a resistência do concreto ao cisalhamento degrada.
    *   Se usar Modelo I (Biela 45º):
        $$ V_{c,fad} = 0.5 \cdot V_{c0} $$
        *(Onde $V_{c0}$ é o valor calculado no Passo 3 - ELU)* [Fonte 357].
    *   *Nota:* A norma manda reduzir a contribuição do concreto em 50% para o cálculo da tensão no estribo sob fadiga.

2.  **Força no Estribo ($V_{sw}$):**
    $$ V_{sw,max} = V_{max} - V_{c,fad} $$
    $$ V_{sw,min} = V_{min} - V_{c,fad} $$
    *(Se $V_{min} < V_{c,fad}$, então $V_{sw,min} = 0$)*.

3.  **Tensão no Estribo ($\sigma_{sw}$):**
    Considerando estribos verticais e a área de aço transversal efetiva ($A_{sw}/s$) calculada/adotada no Passo 3:
    $$ \sigma_{sw,max} = \frac{V_{sw,max}}{0.9 \cdot d \cdot (A_{sw}/s)} $$
    $$ \sigma_{sw,min} = \frac{V_{sw,min}}{0.9 \cdot d \cdot (A_{sw}/s)} $$

4.  **Verificação ($\Delta \sigma_{sw}$):**
    $$ \Delta \sigma_{sw} = \sigma_{sw,max} - \sigma_{sw,min} $$
    *   **Limite para Estribos (CA-50):**
        *   Até $\phi 10$mm: Limite $\approx 85$ MPa (Valor conservador para estribos comuns, ver Tabela 23.2 da norma para valores exatos dependendo do mandril de dobramento).
        *   *Sugestão para o App:* Adotar limite default de **85 MPa** para estribos, pois o dobramento nos cantos reduz drasticamente a resistência à fadiga [Fonte 360-361].

---

## 4.7 Saída do Módulo (Output Object)

```json
{
  "results_Fatigue": {
    "load_combination": {
      "type": "Frequent",
      "psi_fad": 1.0,
      "M_max": 32000,
      "M_min": 12000
    },
    "section_properties_II": {
      "x_II": 18.5,
      "I_II": 450000
    },
    "longitudinal_check": {
      "sigma_s_max": 250.0,
      "sigma_s_min": 80.0,
      "delta_sigma": 170.0,
      "limit": 190.0,
      "status": "OK"
    },
    "stirrup_check": {
      "Vc_reduced": 40.0,
      "delta_sigma_sw": 95.0,
      "limit": 85.0,
      "status": "FAIL" // Usuário deve aumentar diâmetro ou diminuir espaçamento
    }
  }
}

--------------------------------------------------------------------------------
4.8 Notas para Implementação
1. Iteração de Projeto: Se a fadiga falhar, o algoritmo não "corrige" automaticamente no MVP. Ele deve retornar o erro e sugerir: "Aumente a área de aço". A fadiga é governada pela tensão de serviço; aumentar A 
s
​
  reduz a tensão no aço.
2. Atenção aos Estribos: Em vigas de ponte, é comum que o ELU peça um estribo ϕ10c/20, mas a Fadiga exija ϕ10c/10. O App deve alertar que Fadiga foi o critério governante.