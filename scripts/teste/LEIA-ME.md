# Painel de teste — como é montado (não entregar à equipe)

As páginas `*/plataforma.html` são cópias das páginas do Apps Script oficial (export JSON do projeto
"Ferramentas_Meteorologista"), com `%%BASE%%` → `../`, `%%FERRAMENTA%%` → nome da ferramenta e `%%VERSAO%%` → versão de teste.
`assets/planner-teste.js` é o `assets/planner.js` oficial com dados de demonstração (sem Apps Script o Planner não lê a planilha).

Para atualizar quando a equipe mandar um JSON novo:
1. extrair os arquivos do JSON numa pasta (um arquivo por item de `files`, .html/.gs);
2. `python3 scripts/teste/gerar_teste.py <pasta> . teste-AAAAMMDDx`;
3. copiar do repositório oficial os arquivos que a equipe mudou (ex.: `assets/planner.js`, `*/app-drive.js`) e reaplicar as nossas mudanças.
