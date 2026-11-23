"""Sondagem (só leitura): como estão organizados o MERGE (CPTEC) e o CHIRPS mensal."""
import urllib.request, re, sys
def ler(u, n=4000):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'ferramentas-meteorologia-patrick'}), timeout=60) as r:
            return r.read(n).decode('latin-1', 'replace')
    except Exception as e:
        return 'ERRO %s' % e
B='https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/'
for u in [B+'SPI/', B+'ANOMALY/', B+'CLIMATOLOGY/MONTHLY_ACCUMULATED_YEARLY/', B+'CLIMATOLOGY/MONTHLY_ACCUMULATED/', B+'CLIMATOLOGY/ANOMALY_MONTHLY_ACCUMULATED_YEARLY/']:
    t = ler(u, 400000)
    nomes = re.findall(r'href="([^"?/][^"]*)"', t)
    print('==', u); print('  ', len(nomes), 'itens; primeiros:', nomes[:10], '; últimos:', nomes[-8:])
    for sub in [n for n in nomes if n.endswith('/')][-2:]:
        t2 = ler(u+sub, 400000); n2 = re.findall(r'href="([^"?/][^"]*)"', t2)
        print('   --', sub, len(n2), n2[:6], n2[-6:])
for u in [B+'DAILY/2026/10/MERGE_CPTEC_20261001.ctl']:
    print('==', u); print(ler(u, 3000))
