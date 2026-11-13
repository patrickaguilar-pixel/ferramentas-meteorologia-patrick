#!/usr/bin/env python3
"""
Compara a grade da ferramenta com os MAPAS OFICIAIS (PNG do QGIS) do mesmo mês.
O PNG é georreferenciado pelo modelo de layout da equipe (item de mapa em 7,329 x 6,898 mm, 282,38 x 196,157 mm,
extensão -52,2119 a -38,7273 / -23,4627 a -14,0955; 3507 x 2480 px). Em cada célula de MG, a cor do PNG vira
classe pela cor mais próxima da legenda oficial; pixels de linha (divisas, textos) ficam de fora.
Uso: python3 comparar_oficial.py --png-dir PASTA_DOS_PNG [--txt-dir ../exemplo]
"""
import argparse, sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import referencia as R

MAPA = dict(x=7.32896, y=6.89784, w=282.38, h=196.157, xmin=-52.21190831263809429, xmax=-38.72728112023430214, ymin=-23.46271192043639786, ymax=-14.09552814556048794)
PX_MM = 3507 / 297.0

def h2rgb(h): return [int(h[i:i + 2], 16) for i in (1, 3, 5)]
def seq(a, b, s): return [round(a + i * s, 6) for i in range(int(round((b - a) / s)) + 1)]
# legendas dos mapas oficiais de set/2026 (limites como no QGIS: valor <= limite)
OFICIAL = {
  'prec': ('PREC_SET_2026.png', 'PREC_SET_2026.txt', 'acum', seq(15, 65, 5),
           ['#f7fbff', '#e6f0f9', '#d4e5f4', '#c2d9ee', '#a6cde4', '#85bcdc', '#63a9d3', '#4695c8', '#2e7ebc', '#1967ad', '#084e98', '#08306b']),
  'aprec': ('A_PREC_SET_2026.png', 'PREC_SET_2026.txt', 'anomPct', [-90, -80, -70, -60, -50, -40, -30, -20, -10, 10, 20, 30, 40, 50, 60, 70, 80, 90],
           ['#da3c43', '#e15a55', '#e97867', '#f19679', '#f5ad8d', '#f5bca2', '#f6cbb7', '#f6dacd', '#f7e8e2', '#ffffff', '#e5eef3', '#d3e5ee', '#c0dcea', '#aed3e5', '#9bcae1', '#85beda', '#6baed2', '#529fc9', '#0571b0']),
  # a escala oficial da anomalia de Tméd tinha o limite -3,5 faltando (ESCALA_EXTENSA_ATEMP_CORR_3): é como o QGIS pintou
  'atmed': ('A_TMED_SET_2026.png', 'TEMP_MED_SET_2026.txt', 'anom_med', [-4.5, -4, -3, -2.5, -2, -1.5, -1, -0.1, 0.1, 1, 2, 3, 4, 5, 6, 7, 8],
           ['#034b75', '#3a7ab1', '#4083c1', '#6db3d6', '#aed3e5', '#c0dcea', '#d3e5ee', '#e5eef3', '#ffffff', '#f7e8e2', '#f6dacd', '#f6cbb7', '#f5bca2', '#f5ad8d', '#f19679', '#e97867', '#e15a55', '#da3c43']),
  'tmax': ('T_MAX_ABS_SET_2026.png', 'TEMP_MAX_SET_2026.txt', 'abs_max', seq(26.5, 38.5, 1.5),
           ['#fff5f0', '#fee3d6', '#fdc6af', '#fca486', '#fc8161', '#f85d42', '#ea372a', '#cc191d', '#a91016', '#67000d']),
  'tmin': ('T_MIN_ABS_SET_2026.png', 'TEMP_MIN_SET_2026.txt', 'abs_min', seq(6.5, 18.5, 1.5),
           ['#08519c', '#1d6cb1', '#3585bf', '#529dcc', '#73b2d8', '#9ac8e0', '#bad6eb', '#d1e2f3', '#e4eff9', '#f7fbff']),
}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--png-dir', required=True); ap.add_argument('--txt-dir', default=str(Path(__file__).parents[1] / 'exemplo'))
    a = ap.parse_args()
    G = R.GRADE
    masc = R.mascara(R.carregar_mesos(Path(__file__).parents[1] / 'meso.js'))
    lon = G['lon0'] + np.arange(G['nx']) * G['d']; lat = G['lat0'] - np.arange(G['ny']) * G['d']
    LON, LAT = np.meshgrid(lon, lat)
    px = ((MAPA['x'] + (LON - MAPA['xmin']) / (MAPA['xmax'] - MAPA['xmin']) * MAPA['w']) * PX_MM).round().astype(int)
    py = ((MAPA['y'] + (MAPA['ymax'] - LAT) / (MAPA['ymax'] - MAPA['ymin']) * MAPA['h']) * PX_MM).round().astype(int)
    print('Comparação com os mapas oficiais (todas as estações válidas, como no QGIS; nenhuma retirada)')
    for prod, (png, txt, campo, lim, cores) in OFICIAL.items():
        f = Path(a.png_dir) / png
        if not f.exists(): print(f'{prod:6} sem {png}'); continue
        im = np.asarray(Image.open(f).convert('RGB')).astype(int)
        est = [e for e in R.ler_txt(Path(a.txt_dir) / txt) if np.isfinite(e.get(campo, np.nan)) and np.isfinite(e['lat'])]
        g = R.idw_grade(np.array([e['lon'] for e in est]), np.array([e['lat'] for e in est]), np.array([e[campo] for e in est]), masc)
        sel = (masc >= 0) & (px > 0) & (py > 0) & (px < im.shape[1]) & (py < im.shape[0])
        cor = im[py[sel], px[sel]]
        paleta = np.array([h2rgb(c) for c in cores])
        d = np.sqrt(((cor[:, None, :] - paleta[None, :, :]) ** 2).sum(-1))
        c_png, dmin = d.argmin(1), d.min(1)
        limpo = dmin < 6   # só pixels com a cor exata de uma classe (fora de linhas e textos)
        c_nos = R.classe(g[sel], lim)
        igual = (c_png == c_nos)[limpo].mean() * 100
        perto = (np.abs(c_png - c_nos) <= 1)[limpo].mean() * 100
        print(f'{prod:6} {len(est):3} estações · {limpo.sum():6} células comparadas · mesma classe {igual:5.1f} % · até 1 classe de diferença {perto:5.1f} %')

if __name__ == '__main__':
    main()
