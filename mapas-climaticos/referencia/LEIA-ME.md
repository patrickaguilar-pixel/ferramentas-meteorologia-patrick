# Mapas Climáticos — referência e testes

A ferramenta do navegador (`../nucleo.js`) e esta referência em Python calculam a mesma coisa de forma independente.
**Toda mudança no `nucleo.js` precisa passar nos três testes abaixo antes de publicar.**

| Teste | Comando | O que exige |
|---|---|---|
| Núcleo (leitura e conferência) | `node testar_nucleo.js` | 24 casos: arquivos defeituosos recusados com mensagem clara, contas da planilha, zeros suspeitos, meses diferentes, CSV sem fórmula, HTML tratado como texto |
| Equivalência navegador × Python | `python3 testar_equivalencia.py` | mesma máscara de MG, diferença < 1e-9 na grade e 100 % das classes iguais nos 5 produtos |
| Comparação com os mapas oficiais | `python3 comparar_oficial.py --png-dir PASTA_DOS_PNG` | mapas oficiais do QGIS do mesmo mês (set/2026: 98,5 a 99,7 % na mesma classe; anomalia de Tméd 92,4 %, 99,6 % até 1 classe) |

Dependências: Node 18+, Python 3 com numpy, matplotlib e Pillow.

Método (fase 1, igual ao QGIS do Anexo M): IDW potência 2, todas as estações aprovadas, distância em graus
(EPSG:4326), grade de 0,01°, recorte pelas mesorregiões, classe = primeira com valor <= limite.
