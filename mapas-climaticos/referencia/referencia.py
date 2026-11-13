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


# ======================= krigagem ordinária (em avaliação) — implementação independente =======================
KRIG = dict(vizinhas=20, alcances=np.arange(20, 1200 + 1e-9, 10), faixas=18, min_pares=30, lat0=-18.5, R=6371.0088)


def plano_km(lon, lat):
    k = KRIG['R'] * np.pi / 180
    return np.column_stack([np.asarray(lon) * k * np.cos(np.radians(KRIG['lat0'])), np.asarray(lat) * k])


def ajustar_variograma(lon, lat, v):
    xy = plano_km(lon, lat)
    i, j = np.triu_indices(len(v), 1)
    h = np.hypot(*(xy[i] - xy[j]).T)
    g = 0.5 * (v[i] - v[j]) ** 2
    vari = max(float(np.mean((v - v.mean()) ** 2)), 1e-6)
    bordas = np.quantile(h, 0.05 + 0.90 * np.arange(KRIG['faixas'] + 1) / KRIG['faixas'])
    H, G, Wn = [], [], []
    for lo, hi in zip(bordas[:-1], bordas[1:]):
        sel = (h >= lo) & (h < hi)
        if sel.sum() >= KRIG['min_pares']:
            H.append(float(np.median(h[sel]))); G.append(float(g[sel].mean())); Wn.append(int(sel.sum()))
    if len(H) < 3:
        return dict(pepita=0.0, patamar=vari, alcance=300, ajustado=False)
    H, G, W = np.array(H), np.array(G), np.array(Wn) / max(Wn)
    melhor = None
    for a in KRIG['alcances']:
        f = 1 - np.exp(-H / a)
        X = np.column_stack([np.ones_like(f), f]) * np.sqrt(W)[:, None]
        pep, pat = np.linalg.lstsq(X, G * np.sqrt(W), rcond=None)[0]
        if not pep >= 0:
            pep, pat = 0.0, float((W * f * G).sum() / (W * f * f).sum())
        if not pat > 0:
            pat = 1e-6 * vari; pep = max(0.0, float((W * (G - pat * f)).sum() / W.sum()))
        sse = float((W * (pep + pat * f - G) ** 2).sum())
        if melhor is None or sse < melhor[0] - 1e-12 * max(1, melhor[0]):
            melhor = (sse, float(pep), float(pat), int(round(a)))
    return dict(pepita=melhor[1], patamar=melhor[2], alcance=melhor[3], ajustado=True)


class Krigagem:
    def __init__(self, lon, lat, v, vario):
        self.xy, self.v, self.V = plano_km(lon, lat), np.asarray(v, float), vario
        self.k = min(KRIG['vizinhas'], len(v)); self.cache = {}

    def _inv(self, idx):
        chave = idx.tobytes()
        if chave not in self.cache:
            V, P = self.V, self.xy[idx]
            D = np.hypot(*(P[:, None, :] - P[None, :, :]).transpose(2, 0, 1))
            C = V['patamar'] * np.exp(-D / V['alcance']); np.fill_diagonal(C, V['patamar'] + V['pepita'])
            n = len(idx); A = np.ones((n + 1, n + 1)); A[:n, :n] = C; A[n, n] = 0
            self.cache[chave] = np.linalg.inv(A)
        return self.cache[chave]

    def estimar(self, q, piso=None):
        """q: pontos (m, 2) em km. Vizinhas = as k de menor distância (empate: menor índice)."""
        d2 = ((self.xy[None, :, :] - q[:, None, :]) ** 2).sum(-1)
        viz = np.sort(np.argsort(d2, axis=1, kind='stable')[:, :self.k], axis=1)
        out = np.empty(len(q))
        for c in range(len(q)):
            idx = viz[c]; inv = self._inv(idx)
            b = np.append(self.V['patamar'] * np.exp(-np.hypot(*(self.xy[idx] - q[c]).T) / self.V['alcance']), 1.0)
            out[c] = (inv[:-1] @ b) @ self.v[idx]
        return np.maximum(out, piso) if piso is not None else out


def krigagem_grade(lon_e, lat_e, val, masc, piso=None, G=GRADE):
    K = Krigagem(lon_e, lat_e, val, ajustar_variograma(lon_e, lat_e, val))
    lon = G['lon0'] + np.arange(G['nx']) * G['d']
    lat = G['lat0'] - np.arange(G['ny']) * G['d']
    out = np.full((G['ny'], G['nx']), np.nan)
    for j in range(G['ny']):
        cols = np.where(masc[j] >= 0)[0]
        if cols.size:
            out[j, cols] = K.estimar(plano_km(lon[cols], np.full(cols.size, lat[j])), piso)
    return out, K.V


def dentro_mg(mesos, lon, lat):
    """Estação dentro de alguma mesorregião (par-ímpar por anéis), como o nucleo.js faz para "estação de MG"."""
    from matplotlib.path import Path as MPath
    for f in mesos['features']:
        g = f['geometry']
        dentro = False
        for poly in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']):
            for ring in poly:
                dentro ^= bool(MPath(np.asarray(ring)).contains_point((lon, lat)))
        if dentro:
            return True
    return False

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
