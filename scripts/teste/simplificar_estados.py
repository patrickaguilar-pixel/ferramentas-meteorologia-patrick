#!/usr/bin/env python3
"""Simplifica os contornos dos estados VIZINHOS em brasil_estados.js (MG fica intacto: é a máscara de recorte).
Uso: python3 simplificar_estados.py arquivo.js [tolerância_graus=0.0015]   (0.0015° ≈ 160 m; no layout A4, 1 px ≈ 0.004°)"""
import json, re, sys
f = sys.argv[1]; tol = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0015
s = open(f, encoding='utf-8').read()
i = s.index('{'); j = s.rindex('}') + 1
gj = json.loads(s[i:j])
def rdp(pts, eps):
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1; L = (dx * dx + dy * dy) ** .5 or 1e-12
    dmax, k = 0, 0
    for n in range(1, len(pts) - 1):
        x0, y0 = pts[n]
        d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / L
        if d > dmax: dmax, k = d, n
    if dmax > eps:
        return rdp(pts[:k + 1], eps)[:-1] + rdp(pts[k:], eps)
    return [pts[0], pts[-1]]
def anel(r):
    out = rdp(r, tol)
    return out if len(out) >= 4 else r
sys.setrecursionlimit(100000)
for ft in gj['features']:
    if ft['properties'].get('UF') == 'MG': continue
    g = ft['geometry']
    if g['type'] == 'Polygon': g['coordinates'] = [anel(r) for r in g['coordinates']]
    else: g['coordinates'] = [[anel(r) for r in p] for p in g['coordinates']]
novo = s[:i] + json.dumps(gj, ensure_ascii=False, separators=(',', ':')) + s[j:]
open(f, 'w', encoding='utf-8').write(novo)
print(f, len(s) // 1024, 'KB ->', len(novo) // 1024, 'KB')
