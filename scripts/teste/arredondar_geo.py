#!/usr/bin/env python3
"""Arredonda as coordenadas dos arquivos de mapa (GeoJSON em .js) para deixar o carregamento mais rápido.
Uso: python3 arredondar_geo.py <casas_decimais> arquivo.js [arquivo.js ...]
5 casas ≈ 1 m; 4 casas ≈ 11 m. Só números com mais casas que isso são mexidos (códigos e textos ficam iguais)."""
import re, sys
casas = int(sys.argv[1])
pad = re.compile(r'(-?\d+\.\d{%d})(\d+)' % (casas + 1))
def arred(m):
    v = round(float(m.group(0)), casas)
    s = ('%.' + str(casas) + 'f') % v
    s = s.rstrip('0').rstrip('.') if '.' in s else s
    return '0' if s in ('-0', '') else s
for f in sys.argv[2:]:
    s = open(f, encoding='utf-8').read()
    antes = len(s.encode('utf-8'))
    n = re.sub(r'-?\d+\.\d{%d,}' % (casas + 1), arred, s)
    open(f, 'w', encoding='utf-8').write(n)
    print('%-42s %7d KB -> %7d KB' % (f, antes // 1024, len(n.encode('utf-8')) // 1024))
