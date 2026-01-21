# Lógica de Cálculo - Capítulo 1: DADOS DE ENTRADA E PRÉ-PROCESSAMENTO
**Contexto:** Preparação dos dados para dimensionamento de Viga T/Retangular em Pontes.

Este módulo é responsável por receber as variáveis do usuário e do arquivo Excel, aplicar os coeficientes normativos automáticos e gerar o objeto `InputData` consolidado que será usado nos módulos de cálculo subsequentes.

---

## 1.1 Entrada de Geometria (Seção Transversal)
O aplicativo deve suportar **Seção T** genérica. A seção **Retangular** é tratada como um caso particular onde a largura da mesa é igual à da alma.

### Variáveis Exigidas:
*   `h`: Altura total da seção (cm).
*   `bw`: Largura da alma (cm).
*   `bf`: Largura da mesa colaborante (cm).
    *   *Lógica de Interface:* Se o usuário selecionar "Seção Retangular", o sistema define internamente `bf = bw`.
*   `hf`: Altura da mesa (cm).
    *   *Lógica:* Se Retangular, `hf = 0` (ou ignorado).
*   `d_linha_estimado`: Distância do centro da armadura à face (cm).
    *   *Default:* `c_nom + phi_estribo + 1.0cm`.

### Cálculo Automático da Altura Útil (d):
O algoritmo deve calcular um `d` inicial para o primeiro loop de cálculo.
$$d = h - d'_{estimado}$$

---

## 1.2 Propriedades dos Materiais (NBR 6118:2023)

### Concreto
*   **Input:** `fck` (Resistência característica em MPa).
*   **Cálculos Automáticos (Pré-processamento):**
    1.  **Resistência de Cálculo ($f_{cd}$):**
        $$f_{cd} = \frac{f_{ck}}{\gamma_c}$$
        *(Default $\gamma_c = 1.4$ conforme NBR 6118)* [1].
    2.  **Resistência à Tração Média ($f_{ctm}$):**
        Necessária para verificação de fissuração e cisalhamento.
        *   Para $f_{ck} \le 50$ MPa:
            $$f_{ctm} = 0.3 \cdot f_{ck}^{2/3}$$ [2]
        *   Para $f_{ck} > 50$ MPa:
            $$f_{ctm} = 2.12 \cdot \ln(1 + 0.11 \cdot f_{ck})$$
    3.  **Módulo de Elasticidade ($E_{cs}$):**
        Crucial para o cálculo de flecha (Rigidez Equivalente).
        *   $E_{ci} = \alpha_E \cdot 5600 \cdot \sqrt{f_{ck}}$ (Adotar $\alpha_E = 1.2$ para granito/gneisse como default) [3].
        *   $E_{cs} = \alpha_i \cdot E_{ci}$ (Adotar $\alpha_i = 0.85 + \dots$ conforme NBR 6118:2023 ou simplificar para $0.85 \cdot E_{ci}$) [4].

### Aço (Armadura Passiva)
*   **Input:** Categoria (Default: CA-50).
*   **Constantes Fixas:**
    *   $f_{yk} = 500$ MPa (se CA-50).
    *   $E_s = 210$ GPa (Módulo de Elasticidade) [5][6].
    *   $\gamma_s = 1.15$ (Default) [6].
    *   $f_{yd} = f_{yk} / \gamma_s$.

---

## 1.3 Parâmetros de Ponte e Coeficientes de Impacto (NBR 7188)
Esta é a etapa crítica que diferencia este app de calculadoras comuns. O software deve ajustar os esforços estáticos vindos do Excel.

### Inputs de Ponte:
*   `L_vao`: Vão da estrutura (m).
*   `Tipo_Obra`: "Concreto" ou "Aço/Mista".
*   `Check_CIV`: "O Excel já inclui impacto?" (Sim/Não).

### Lógica do CIV (Coeficiente de Impacto Vertical):
Se `Check_CIV == Não`, o algoritmo calcula o amplificador dinâmico conforme NBR 7188 [7]:

1.  **Cálculo:**
    *   Se $L_{vao} < 10m$:
        $$CIV = 1.35$$
    *   Se $10m \le L_{vao} < 200m$:
        $$CIV = 1 + 1.06 \cdot \left( \frac{20}{L_{vao} + 50} \right)$$
    *   Se $L_{vao} \ge 200m$:
        $$CIV = 1$$
    *(Nota: Para estruturas enterradas, há redução baseada na altura de aterro $h_{cob}$, mas assumiremos ponte aérea padrão para o MVP)* [8].

2.  **Coeficiente de Impacto Adicional (CIA):**
    Para dimensionamento de lajes e transversinas próximas a juntas:
    *   $CIA = 1.25$ (Obras de Concreto) [9].
    *   *Para vigas longitudinais (foco do app), geralmente CIA = 1.0, mas deve-se permitir override.*

3.  **Coeficiente de Número de Faixas (CNF):**
    *   Default: $CNF = 1.0$ (Conservador para viga isolada) [10].

---

## 1.4 Processamento do Arquivo de Esforços (Excel)
O algoritmo deve ler a matriz de dados e gerar vetores de cálculo ponderados.

### Estrutura dos Dados Lidos (Raw Data):
Para cada ponto $x$ ao longo da viga (discretização):
*   $M_{g,k}$ (Momento Permanente característico)
*   $M_{q,k}$ (Momento Móvel característico - Estático do Ftool)
*   $V_{g,k}$ (Cortante Permanente)
*   $V_{q,k}$ (Cortante Móvel - Estático)

### Geração dos Vetores de Cálculo (Processed Data):
O algoritmo deve criar os seguintes valores para cada ponto $x$:

1.  **Aplicacao do Impacto (se necessario):**
    $$M_{q,k,final} = M_{q,k} \cdot CIV \cdot CIA \cdot CNF$$
    $$V_{q,k,final} = V_{q,k} \cdot CIV \cdot CIA \cdot CNF$$
    *(Onde CIV = Impacto Vertical, CIA = 1.25 para concreto, CNF = 1.0)*

2.  **Combinação ELU (Normal):**
    Para dimensionamento da armadura e bielas.
    $$M_{d} = \gamma_{g} \cdot M_{g,k} + \gamma_{q} \cdot M_{q,k,final}$$
    $$V_{d} = \gamma_{g} \cdot V_{g,k} + \gamma_{q} \cdot V_{q,k,final}$$
    *(Defaults: $\gamma_g = 1.4, \gamma_q = 1.4$. Se cargas favoráveis, considerar $\gamma_g = 1.0$)* [11].

3.  **Combinacao ELS (Servico) - Quase Permanente:**
    Para calculo de Flecha (fluencia).
    $$M_{ser,QP} = M_{g,k} + \psi_2 \cdot M_{q,k,final}$$
    *(Ponte Rolante: $\psi_2 = 0.5$ conforme NBR 8681 Tab. 6)* [12].

4.  **Combinacao ELS (Servico) - Frequente:**
    Para verificacao de Fissuracao (protecao armadura).
    $$M_{ser,Freq} = M_{g,k} + \psi_1 \cdot M_{q,k,final}$$
    *(Ponte Rolante: $\psi_1 = 0.8$ conforme NBR 8681 Tab. 6)* [12].

5.  **Combinacao Fadiga:**
    Para verificacao de vida util.
    $$M_{fad,max} = M_{g,k} + 1.0 \cdot M_{q,k,final,max}$$
    $$M_{fad,min} = M_{g,k} + 1.0 \cdot M_{q,k,final,min}$$
    $$\Delta M = M_{fad,max} - M_{fad,min}$$

### Saída deste Módulo (Objeto JSON para o Motor de Cálculo):
```json
{
  "geometry": { "bw": 30, "h": 60, "bf": 80, "hf": 10, "d": 55 },
  "materials": { "fcd": 2.14, "fyd": 43.48, "Ecs": 2600, "fctm": 0.29 },
  "loads": [
    {
      "x": 0.0,
      "Md_max": 0.0,
      "Vd_max": 185.5,  // Já com Gamma_f e CIV
      "M_fadiga_max": 0.0,
      "M_fadiga_min": 0.0
    },
    {
      "x": 3.0,
      "Md_max": 450.2,
      "Vd_max": 45.0,
      "M_fadiga_max": 320.1, // Combinacao Frequente (psi1)
      "M_fadiga_min": 120.5
    }
    // ...
  ]
}