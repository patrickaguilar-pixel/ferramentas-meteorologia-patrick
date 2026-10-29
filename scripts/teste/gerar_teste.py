#!/usr/bin/env python3
"""Gera o painel de teste a partir das páginas oficiais do Apps Script (export JSON do projeto).
Uso: python3 gerar_teste.py <pasta_gas_extraida> <repo_teste> <versao>"""
import sys, os, re, json
GAS, REPO, V = sys.argv[1], sys.argv[2], sys.argv[3]
PAG = [('TempoSevero', 'tempo-severo'), ('Chuva', 'chuva'), ('Alertas', 'alertas'), ('Previsao', 'previsao'), ('Reservatorios', 'reservatorios')]
for arq, f in PAG:
    s = open(os.path.join(GAS, arq + '.html'), encoding='utf-8').read()
    s = s.replace('%%BASE%%', '../').replace('%%FERRAMENTA%%', f).replace('%%VERSAO%%', V)
    s = s.replace('assets/planner.js?', 'assets/planner-teste.js?')
    s = '<!-- CÓPIA DE TESTE gerada de ' + arq + '.html (Apps Script oficial). Não entregar à equipe. -->\n' + s
    open(os.path.join(REPO, f, 'plataforma.html'), 'w', encoding='utf-8').write(s)
    print('ok', f)

# planner-teste.js = planner.js oficial + dados de demonstração (só fora do Apps Script)
pj = open(os.path.join(REPO, 'assets', 'planner.js'), encoding='utf-8').read()
gs = open(os.path.join(GAS, 'Planner.gs'), encoding='utf-8').read()
ini = re.search(r'const PLN_INICIAIS = (\[.*?\n\]);', gs, re.S).group(1)
anot = re.search(r'const PLN_ANOT_INICIAIS = (\[.*?\n\]);', gs, re.S).group(1)
demo = '''
  /* ===== DEMONSTRAÇÃO (só no painel de testes): sem Apps Script, mostra os produtos iniciais do Planner.gs ===== */
  var PLN_INICIAIS = ''' + ini.replace('\n', '\n  ') + ''';
  var PLN_ANOT_INICIAIS = ''' + anot.replace('\n', '\n  ') + ''';
  function demoDias(t) { t = String(t || '').toLowerCase(); if (t === 'todos') return [0, 1, 2, 3, 4, 5, 6]; var D = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']; return t.split(',').map(function (x) { return D.indexOf(x.trim().slice(0, 3)); }).filter(function (i) { return i >= 0; }); }
  function dadosDemo() {
    return { email: 'demonstração', podeEditar: false, planilhaUrl: '',
      produtos: PLN_INICIAIS.map(function (r, i) { return { id: 'PR' + (i + 1), ativo: true, ordem: (i + 1) * 10, turno: r[0], tipo: r[1], produto: r[2],
        itens: r[3] ? r[3].split(';').map(function (s) { return s.trim(); }).filter(Boolean) : [], detalhe: r[4], dias: demoDias(r[5]), dataInicio: '', dataFim: '',
        periodo: r[6], observacao: r[10] || '', destino: r[7], soCedec: r[8] === 'sim', soDiaUtil: r[9] === 'sim', atualizadoEm: '', atualizadoPor: '' }; }),
      feriados: [{ data: '2026-11-02', nome: 'Finados' }, { data: '2026-11-15', nome: 'Proclamação da República' }, { data: '2026-11-20', nome: 'Consciência Negra' }, { data: '2026-12-25', nome: 'Natal' }],
      anotacoes: PLN_ANOT_INICIAIS.map(function (b, i) { return { ordem: i + 1, bloco: b[0], itens: b[1].split('\\n') }; }) };
  }
'''
a = "  function carregar() {\n    if (!temServidor) { S.erro = 'O planner só funciona dentro do app (Apps Script), onde a planilha é lida com a sua conta.'; return; }"
assert a in pj, 'trecho do carregar() mudou no planner.js oficial'
b = "  function carregar() {\n    if (!temServidor) { S.dados = dadosDemo(); S.msg = 'DEMONSTRAÇÃO (painel de testes): produtos iniciais do manual. Na plataforma oficial, o quadro lê a planilha do planner.'; return; }"
pj = pj.replace(a, demo + b)
pj = '/* CÓPIA DE TESTE do assets/planner.js oficial, com dados de demonstração. Não entregar à equipe. */\n' + pj
open(os.path.join(REPO, 'assets', 'planner-teste.js'), 'w', encoding='utf-8').write(pj)
print('ok planner-teste.js')
