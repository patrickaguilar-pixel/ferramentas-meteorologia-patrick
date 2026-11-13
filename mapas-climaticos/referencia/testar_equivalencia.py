#!/usr/bin/env python3
"""
Teste de equivalência: a grade do navegador (nucleo.js, rodado no Node) tem que bater com a referência em Python.
Para cada um dos 5 produtos de set/2026 (pasta exemplo/), com as estações "fortes" retiradas e as demais mantidas:
  - mesma máscara de MG (células);
  - diferença máxima da grade < 1e-9;
  - mesma classe em 100 % das células.
Uso: python3 testar_equivalencia.py   (precisa de node, numpy e matplotlib)
"""
import json, subprocess, sys, tempfile
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import referencia as R

AQUI = Path(__file__).resolve().parent
MC = AQUI.parent
CAMPO_PY = {'prec': 'acum', 'aprec': 'anomPct', 'clima': 'clim', 'atmed': 'anom_med', 'tmax': 'abs_max', 'tmin': 'abs_min'}

with tempfile.TemporaryDirectory() as tmp:
    js = subprocess.run(['node', str(AQUI / 'exportar_grades.js'), str(MC / 'exemplo'), tmp], capture_output=True, text=True)
    if js.returncode:
        print(js.stdout, js.stderr); sys.exit('ERRO: o Node não conseguiu gerar as grades')
    info = json.loads((Path(tmp) / 'info.json').read_text())
    mesos = R.carregar_mesos(MC / 'meso.js')
    m_py = R.mascara(mesos)
    m_js = np.fromfile(Path(tmp) / 'mascara.i8', dtype=np.int8).reshape(m_py.shape)
    dif_masc = int(((m_py >= 0) != (m_js >= 0)).sum())
    print(f'máscara: {int((m_py >= 0).sum())} células (Python) x {int((m_js >= 0).sum())} (navegador); diferentes: {dif_masc}')
    falhou = dif_masc > 0
    for prod, d in info['produtos'].items():
        txt = MC / 'exemplo' / d['arquivo']
        est = [e for e in R.ler_txt(txt) if e['linha'] in set(d['linhas'])]
        val = np.array([e[CAMPO_PY[prod]] for e in est])
        g_py = R.idw_grade(np.array([e['lon'] for e in est]), np.array([e['lat'] for e in est]), val, m_js)
        g_js = np.fromfile(Path(tmp) / f'{prod}.f64', dtype=np.float64).reshape(g_py.shape)
        ok = np.isfinite(g_py) & np.isfinite(g_js)
        dmax = float(np.nanmax(np.abs(g_py[ok] - g_js[ok])))
        c_py, c_js = R.classe(g_py[ok], d['lim']), R.classe(g_js[ok], d['lim'])
        igual = float((c_py == c_js).mean() * 100)
        nan_dif = int((np.isfinite(g_py) != np.isfinite(g_js)).sum())
        st = 'OK' if dmax < 1e-9 and igual == 100 and nan_dif == 0 else 'FALHOU'
        falhou |= st != 'OK'
        print(f'{prod:6} {len(est):3} estações · diferença máx. {dmax:.2e} · classes iguais {igual:.4f} % · células sem valor diferentes {nan_dif} · {st}')
        # krigagem (em avaliação): variograma e grade
        lon_e, lat_e = np.array([e['lon'] for e in est]), np.array([e['lat'] for e in est])
        gk_py, V = R.krigagem_grade(lon_e, lat_e, val, m_js, d['piso'])
        gk_js = np.fromfile(Path(tmp) / f'{prod}_krig.f64', dtype=np.float64).reshape(g_py.shape)
        vj = d['vario']
        dv = max(abs(V['pepita'] - vj['pepita']) / max(1, abs(vj['pepita'])), abs(V['patamar'] - vj['patamar']) / max(1, abs(vj['patamar'])), abs(V['alcance'] - vj['alcance']))
        okk = np.isfinite(gk_py) & np.isfinite(gk_js)
        dk = float(np.max(np.abs(gk_py[okk] - gk_js[okk])))
        igk = float((R.classe(gk_py[okk], d['lim']) == R.classe(gk_js[okk], d['lim'])).mean() * 100)
        stk = 'OK' if dv < 1e-6 and dk < 1e-6 and igk >= 99.999 and int((np.isfinite(gk_py) != np.isfinite(gk_js)).sum()) == 0 else 'FALHOU'
        falhou |= stk != 'OK'
        extra = ''
        if d.get('loo'):
            # validação cruzada da krigagem refeita no Python (variograma reajustado sem a estação)
            mg = [i for i, e in enumerate(est) if R.dentro_mg(mesos, e['lon'], e['lat'])]
            errs = []
            for i in mg:
                k = np.arange(len(est)) != i
                K = R.Krigagem(lon_e[k], lat_e[k], val[k], R.ajustar_variograma(lon_e[k], lat_e[k], val[k]))
                errs.append(K.estimar(R.plano_km([lon_e[i]], [lat_e[i]]), d['piso'])[0] - val[i])
            rm = float(np.sqrt(np.mean(np.square(errs))))
            extra = f' · validação cruzada RMSE {rm:.4f} (Python) x {d["loo"]["rmse"]:.4f} (navegador)'
            if abs(rm - d['loo']['rmse']) > 1e-6 or len(mg) != d['loo']['n']: falhou = True; extra += ' FALHOU'
        print(f'       krigagem: alcance {vj["alcance"]} km · diferença máx. {dk:.2e} · classes iguais {igk:.4f} % · {stk}{extra}')
    print('RESULTADO:', 'FALHOU' if falhou else 'OK — navegador e referência em Python batem')
    sys.exit(1 if falhou else 0)
