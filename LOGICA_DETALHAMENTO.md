# Lógica de Detalhamento e Geometria da Seção (NBR 6118:2023)

Este módulo define as regras para validação da disposição das armaduras informadas pelo usuário e cálculo das propriedades geométricas reais da seção.

## 1. Materiais Padrão
*   **Armadura Longitudinal:** Aço CA-50 ($f_{yk} = 500$ MPa, $f_{yd} = 435$ MPa) [1, 2].
*   **Estribos:** Aço CA-50 ou CA-60 ($f_{ywk} = 500$ ou $600$ MPa) [3].

## 2. Disposição da Armadura (Validação Geométrica)
O software deve permitir inputs de 1, 2 ou 3 camadas de armadura. Para validar se a armadura "cabe" na largura ($b_w$), verifique:

### 2.1 Espaçamento Horizontal Livre ($a_h$)
A distância livre entre faces de barras longitudinais deve ser o **maior** entre [6, 7]:
1.  20 mm.
2.  Diâmetro da barra ($\phi$).
3.  $1.2 \times d_{max}$ (dimensão máxima do agregado, adotar 19mm/brita 1 como padrão se não informado).

**Fórmula de Verificação:**
$$ b_{disponivel} = b_w - 2\cdot(c_{nom} + \phi_{estribo}) $$
$$ Espaço_{req} = (n_{barras} \times \phi_{long}) + (n_{barras}-1) \times a_{h,min} $$
*   Se $Espaço_{req} > b_{disponivel} \rightarrow$ **ERRO:** "Armadura não cabe na camada. Aumente a seção ou use mais camadas."

### 2.2 Espaçamento Vertical Livre ($a_v$)
Entre camadas de armadura, a distância livre mínima deve ser o **maior** entre [6, 7]:
1.  20 mm.
2.  Diâmetro da barra ($\phi$).
3.  $0.5 \times d_{max}$.

### 2.3 Cobrimento Nominal ($c_{nom}$)
Respeitar a Tabela 7.2 da NBR 6118 baseada na Classe de Agressividade (CAA) [5]:
*   CAA I: 25mm (Viga).
*   CAA II: 30mm (Viga).
*   CAA III: 40mm (Viga).
*   CAA IV: 50mm (Viga).

## 3. Recálculo da Altura Útil Real ($d_{real}$)
Ao inserir a armadura manualmente, o $d$ (altura útil) deixa de ser estimado e passa a ser exato baseada no centróide das barras [8, 9].

1.  Calcular a posição do centro de gravidade ($y_{CG}$) de todas as barras em relação à face tracionada.
2.  Calcular $d_{real} = h - y_{CG}$.
3.  **Recalcular a Resistência:** Usar este $d_{real}$ para recalcular o Momento Resistente ($M_{Rd}$) e verificar se $M_{Rd} \ge M_{Sd}$.

---

## 4. Decalagem do Diagrama de Momentos ($a_l$) - NBR 6118:2023 (Item 17.4.2.2-c)

Para garantir a ancoragem correta da armadura longitudinal, o diagrama de momentos deve ser deslocado horizontalmente. A armadura deve resistir ao momento "decalado", não ao momento teórico.

### 4.1 Fórmula Atualizada (Modelo I - Estribos Verticais)
$$ a_l = 0,5 \cdot d \cdot \frac{V_{Sd,max}}{V_{Sd,max} - V_{c0}} $$

Onde:
*   $d$ = altura útil da seção (cm).
*   $V_{Sd,max}$ = cortante máximo de cálculo na seção (kN).
*   $V_{c0}$ = parcela resistida pelo concreto (kN).

### 4.2 Limites e Condições
*   **Limite Inferior:** $a_l \ge 0,5 \cdot d$ (sempre).
*   **Caso Especial:** Se $V_{Sd,max} \le V_{c0}$, adotar $a_l = 0,5 \cdot d$.

> **⚠️ IMPORTANTE:** A fórmula antiga ($a_l = 0,5d$) subestimava o comprimento em vigas muito solicitadas ao cisalhamento. A NBR 6118:2023 corrigiu isso para garantir segurança.

### 4.3 Aplicação Prática
1.  Deslocar o diagrama de momentos de $a_l$ para cada lado.
2.  A armadura em cada seção deve resistir ao momento do diagrama deslocado.
3.  Usar este diagrama para definir os pontos de corte das barras.