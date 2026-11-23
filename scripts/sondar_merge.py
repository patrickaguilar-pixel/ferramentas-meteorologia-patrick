"""Sondagem (só leitura): como estão organizados o MERGE (CPTEC) e o CHIRPS mensal."""
import urllib.request, re, sys
def ler(u, n=4000):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'ferramentas-meteorologia-patrick'}), timeout=60) as r:
            return r.read(n).decode('latin-1', 'replace')
    except Exception as e:
        return 'ERRO %s' % e
for u in ['https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/',
          'https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/DAILY/',
          'https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/DAILY/2026/',
          'https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/DAILY/2026/10/',
          'https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/MONTHLY/',
          'https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/CLIMATOLOGY/',
          'https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/',
          'https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/',
          'https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/tifs/',
          'https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs/']:
    t = ler(u, 200000)
    nomes = re.findall(r'href="([^"?/][^"]*)"', t)
    print('==', u); print('  ', len(nomes), 'itens; primeiros:', nomes[:8], '; últimos:', nomes[-6:])
    if not nomes: print('  ', t[:300].replace('\n', ' '))
