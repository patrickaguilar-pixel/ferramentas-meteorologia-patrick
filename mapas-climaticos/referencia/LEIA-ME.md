# Mapas Climáticos — referência e testes

A ferramenta do navegador (`../nucleo.js`) e esta referência em Python calculam a mesma coisa de forma independente.
**Toda mudança no `nucleo.js` precisa passar nos três testes abaixo antes de publicar.**

| Teste | Comando | O que exige |
|---|---|---|
| Núcleo (leitura e conferência) | `node testar_nucleo.js` | 29 casos (inclui krigagem e climatologia): arquivos defeituosos recusados com mensagem clara, contas da planilha, zeros suspeitos, meses diferentes, CSV sem fórmula, HTML tratado como texto |
| Equivalência navegador × Python | `python3 testar_equivalencia.py` (~1,5 min) | mesma máscara de MG, diferença < 1e-9 na grade e 100 % das classes iguais nos 6 produtos; na **krigagem**, mesmo variograma, grade com diferença < 1e-6 e mesma validação cruzada |
| Comparação com os mapas oficiais | `python3 comparar_oficial.py --png-dir PASTA_DOS_PNG` | mapas oficiais do QGIS do mesmo mês (set/2026: 98,5 a 99,7 % na mesma classe; anomalia de Tméd 92,4 %, 99,6 % até 1 classe) |

Dependências: Node 18+, Python 3 com numpy, matplotlib e Pillow.

Método (fase 1, igual ao QGIS do Anexo M): IDW potência 2, todas as estações aprovadas, distância em graus
(EPSG:4326), grade de 0,01°, recorte pelas mesorregiões, classe = primeira com valor <= limite.

Krigagem (EM AVALIAÇÃO, separada do IDW): ordinária local com 20 vizinhas; variograma exponencial ajustado no mês
(18 faixas de distância pelos quantis 5–95 %, faixas com 30+ pares, peso √(n/nmax), alcance de 20 a 1200 km de 10 em 10,
pepita e patamar por mínimos quadrados sem negativos); distância em km com x = R·lon·cos(-18,5°), y = R·lat.
Chuva e climatologia com piso 0; anomalia de chuva com piso -100 %.

## Método recomendado (em avaliação) — 13/11/2026
- `../mde.js` lê o relevo (`../mde/`, gerado por `scripts/baixar_mde.py` no GitHub Actions; Copernicus GLO-90, média da célula, SHA-256 conferido).
- `avaliar_metodos.js`: validação cruzada (deixa uma de fora, estações de MG) de IDW-QGIS, krigagem, IDW local e regressão-krigagem, por produto.
  `node avaliar_metodos.js` (retira as de alerta forte) e `node avaliar_metodos.js --sem-conferencia`. Resultados em `avaliacao_*.json`.
- `testar_equivalencia.py` agora confere também o IDW local e a regressão-krigagem contra a implementação independente em `referencia.py`
  (altitudes das estações, coeficientes, grade, classes e a validação cruzada).
