# Lógica de Cálculo - Passo 1: PROPRIEDADES DOS MATERIAIS (ELU)
**Referência Normativa:** ABNT NBR 6118:2023 (Itens 8.2.10, 12.3.3 e 17.2.2)
**Objetivo:** Determinar as resistências de cálculo e os parâmetros do diagrama tensão-deformação retangular simplificado para o Concreto e para o Aço.

---

## 1.1 Entradas (Inputs)
Este módulo recebe os dados brutos definidos no passo anterior:
*   `fck`: Resistência característica do concreto à compressão (MPa).
*   `fyk`: Resistência característica do aço ao escoamento (MPa).
*   `Es`: Módulo de elasticidade do aço (MPa) - Padrão: 210.000 MPa [1].
*   `gamma_c`: Coeficiente de ponderação do concreto (Padrão: 1.4) [2].
*   `gamma_s`: Coeficiente de ponderação do aço (Padrão: 1.15) [2].

---

## 1.2 Algoritmo: Concreto (ConcreteProps)

O dimensionamento no ELU utiliza o **Diagrama Retangular Simplificado**. Os parâmetros desse diagrama ($\lambda$ e $\alpha_c$) variam dependendo se o concreto é de resistência normal (Grupo I: $\le$ C50) ou de alta resistência (Grupo II: C55-C90) [3, 4].

### A. Resistência de Cálculo Base ($f_{cd}$)
Calcula-se a resistência de design dividindo a característica pelo coeficiente de segurança.
$$f_{cd} = \frac{f_{ck}}{\gamma_c}$$

### B. Parâmetros do Diagrama Retangular (NBR 6118:2023)
Define-se a altura do bloco comprimido ($y = \lambda \cdot x$) e a tensão efetiva de cálculo ($\sigma_{cd} = \alpha_c \cdot f_{cd}$).

**Lógica Condicional:**

**SE** $f_{ck} \le 50$ MPa (Grupo I):
1.  **Lambda ($\lambda$):** Fator de altura da zona comprimida.
    $$\lambda = 0.80$$
2.  **Alpha ($\alpha_c$):** Fator de redução da resistência (Efeito Rüsch).
    $$\alpha_c = 0.85$$
    *(Nota: A tensão no bloco será $0.85 \cdot f_{cd}$)* [5].

**SE** $f_{ck} > 50$ MPa (Grupo II - Alta Resistência):
*A norma ajusta os parâmetros pois o diagrama real se torna mais "pontiagudo" (menos plástico).*
1.  **Lambda ($\lambda$):**
    $$\lambda = 0.80 - \frac{(f_{ck} - 50)}{400}$$
2.  **Alpha ($\alpha_c$):**
    $$\alpha_c = 0.85 \cdot \left[ 1.0 - \frac{(f_{ck} - 50)}{200} \right]$$
    *[Fonte: Equação 16 e 17 da Ref. UNESP e NBR 6118 Item 17.2.2]* [5, 6].

### C. Deformação de Ruptura do Concreto ($\epsilon_{cu}$)
Necessário para verificar os domínios.
*   **Se** $f_{ck} \le 50$ MPa: $\epsilon_{cu} = 3.5‰$ ($0.0035$) [7].
*   **Se** $f_{ck} > 50$ MPa:
    $$\epsilon_{cu} = 2.6‰ + 35‰ \cdot \left[ \frac{(90 - f_{ck})}{100} \right]^4$$
    *[Fonte: NBR 6118 Item 8.2.10.1]* [8].

---

## 1.3 Algoritmo: Aço (SteelProps)

Considera-se o diagrama simplificado bilinear (elasto-plástico perfeito) conforme NBR 6118 [9].

### A. Resistência de Cálculo ($f_{yd}$)
$$f_{yd} = \frac{f_{yk}}{\gamma_s}$$

### B. Deformação de Escoamento ($\epsilon_{yd}$)
Ponto onde o aço sai do regime elástico (Lei de Hooke) e entra no patamar plástico constante.
$$\epsilon_{yd} = \frac{f_{yd}}{E_s}$$

*Exemplo para CA-50 ($f_{yk}=500$, $\gamma_s=1.15$):*
$$f_{yd} = 434.78 \text{ MPa}$$
$$\epsilon_{yd} = \frac{434.78}{210000} \approx 0.00207 \text{ ou } 2.07‰$$ [10].

### C. Limite de Alongamento Último ($\epsilon_{su}$)
O valor máximo permitido de deformação plástica para a armadura de tração.
$$\epsilon_{su} = 0.010 \quad (10‰)$$ [7, 11].

---

## 1.4 Saída do Módulo (Output Object)

O código deve retornar um objeto estruturado (JSON) para ser consumido pelos passos seguintes (Domínios e Equilíbrio).

```json
{
  "concrete": {
    "fcd": "Valor calculado (MPa)",
    "lambda": "Fator de altura do bloco (0.8 ou calc)",
    "alpha_c": "Fator de tensão (0.85 ou calc)",
    "sigma_cd": "Valor final de alpha_c * fcd (MPa)",
    "epsilon_cu": "Deformação de ruptura (ex: 0.0035)"
  },
  "steel": {
    "fyd": "Valor calculado (MPa)",
    "Es": 210000,
    "epsilon_yd": "Strain de escoamento (ex: 0.00207)",
    "epsilon_su": 0.010
  }
}
