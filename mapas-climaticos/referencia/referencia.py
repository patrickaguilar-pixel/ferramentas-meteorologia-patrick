#!/usr/bin/env python3
"""
Mapas Climáticos — implementação de REFERÊNCIA em Python (v0.1, 13/11/2026), SIMGE/IGAM.

Serve para conferir a ferramenta do navegador (mapas-climaticos/nucleo.js): as duas calculam a mesma grade
de forma independente e o teste (testar_equivalencia.py) exige que batam.

Método (igual ao QGIS do Anexo M): IDW com potência 2, todas as estações, distância em graus (EPSG:4326),
valor exato em cima da estação; grade de 0,01° (centro das células); recorte pelas mesorregiões de MG;
classe = primeira com valor <= limite.

Uso:
  python3 referencia.py --txt PREC_SET_2026.txt --campo acum --saida grade.npy [--retirar A555,A562]
Dependências: numpy (e matplotlib só para a máscara).
"""
import argparse
import json
import re
import unicodedata
from pathlib import Path

import numpy as np

GRADE = dict(lon0=-51.06, lat0=-14.22, d=0.01, nx=1123, ny=873)

COLUNAS = {   # nome normalizado -> chave (mesma ideia do nucleo.js, escrita de outro jeito)
    'acum': re.compile(r'^ACUMULADO [A-Z]+ \(MM\)$'),
    'clim': re.compile(r'^CLIMATOLOGIA [A-Z]+$'),
    'anomPct': re.compile(r'^ANOMALIA [A-Z]+ \(%\)$'),
    'abs_max': re.compile(r'^TMAXABS DO PERIODO$'),
    'abs_min': re.compile(r'^TMINABS DO PERIODO$'),
    'anom_med': re.compile(r'^ANOMALIA TMED$'),
}


def normalizar(s):
    s = unicodedata.normalize('NFD', str(s))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').upper()
    s = re.sub(r'[^A-Z0-9%() ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def ler_txt(caminho):
    dados = Path(caminho).read_bytes()
    try:
        texto = dados.decode('utf-8')
    except UnicodeDecodeError:
        texto = dados.decode('cp1252')
    linhas = [l for l in texto.lstrip('﻿').splitlines() if l.strip()]
    cab = [normalizar(h) for h in linhas[0].split('\t')]
    idx = {h: i for i, h in enumerate(cab)}
    out = []
    for n, l in enumerate(linhas[1:], start=2):
        c = l.split('\t')
        def num(i):
            try:
                return float(c[i].strip().replace(',', '.'))
            except (ValueError, IndexError):
                return float('nan')
        reg = {'linha': n, 'codigo': c[idx['CODIGO']].strip(), 'lat': num(idx['LATITUDE']), 'lon': num(idx['LONGITUDE'])}
        for chave, rx in COLUNAS.items():
            for h, i in idx.items():
                if rx.match(h):
                    reg[chave] = num(i)
        out.append(reg)
    return out


def carregar_mesos(caminho_js):
    t = Path(caminho_js).read_text(encoding='utf-8')
    return json.loads(t[t.index('{'):t.rindex('}') + 1])


def mascara(mesos, G=GRADE):
    """Máscara com matplotlib.path (outro algoritmo que o do nucleo.js, que usa varredura de linhas)."""
    from matplotlib.path import Path as MPath
    lon = G['lon0'] + np.arange(G['nx']) * G['d']
    lat = G['lat0'] - np.arange(G['ny']) * G['d']
    LON, LAT = np.meshgrid(lon, lat)
    pts = np.column_stack([LON.ravel(), LAT.ravel()])
    m = np.full(pts.shape[0], -1, dtype=np.int8)
    for mi, f in enumerate(mesos['features']):
        g = f['geometry']
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        dentro = np.zeros(pts.shape[0], dtype=bool)
        for poly in polys:
            for ring in poly:   # par-ímpar entre anéis (buracos)
                dentro ^= MPath(np.asarray(ring)).contains_points(pts)
        m[dentro & (m < 0)] = mi
    return m.reshape(G['ny'], G['nx'])


def idw_grade(lon_e, lat_e, val, masc, p=2.0, G=GRADE):
    lon = G['lon0'] + np.arange(G['nx']) * G['d']
    lat = G['lat0'] - np.arange(G['ny']) * G['d']
    out = np.full((G['ny'], G['nx']), np.nan)
    for j in range(G['ny']):
        cols = np.where(masc[j] >= 0)[0]
        if not cols.size:
            continue
        dx = lon_e[None, :] - lon[cols][:, None]
        dy = lat_e[None, :] - lat[j]
        d2 = dx * dx + dy * dy
        exato = d2 < 1e-20
        w = 1.0 / np.where(exato, 1.0, d2) ** (p / 2)
        z = (w * val[None, :]).sum(axis=1) / w.sum(axis=1)
        if exato.any():
            r, k = np.where(exato)
            z[r] = val[k]
        out[j, cols] = z
    return out


def classe(v, lim):
    return np.searchsorted(np.asarray(lim), v, side='left')   # v <= lim[i] -> i


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--txt', required=True)
    ap.add_argument('--campo', required=True, help='acum | anomPct | abs_max | abs_min | anom_med')
    ap.add_argument('--meso', default=str(Path(__file__).resolve().parents[1] / 'meso.js'))
    ap.add_argument('--retirar', default='', help='códigos separados por vírgula')
    ap.add_argument('--usar', default='', help='arquivo com as LINHAS do TXT a usar (uma por linha); se dado, ignora --retirar')
    ap.add_argument('--saida', required=True)
    a = ap.parse_args()
    fora = {c.strip() for c in a.retirar.split(',') if c.strip()}
    usar = {int(x) for x in Path(a.usar).read_text().split()} if a.usar else None
    est = [e for e in ler_txt(a.txt) if (e['linha'] in usar if usar is not None else e['codigo'] not in fora) and np.isfinite(e.get(a.campo, np.nan)) and np.isfinite(e['lat']) and np.isfinite(e['lon'])]
    m = mascara(carregar_mesos(a.meso))
    g = idw_grade(np.array([e['lon'] for e in est]), np.array([e['lat'] for e in est]), np.array([e[a.campo] for e in est]), m)
    np.save(a.saida, g)
    print(f'{len(est)} estações; {int((m >= 0).sum())} células em MG; min {np.nanmin(g):.3f} max {np.nanmax(g):.3f}')


if __name__ == '__main__':
    main()
