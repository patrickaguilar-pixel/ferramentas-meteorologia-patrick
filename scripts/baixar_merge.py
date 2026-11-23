"""
Monitor Climático — produtos de chuva do MERGE (CPTEC/INPE) para Minas Gerais e entorno.

Fonte: https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/  (satélite GPM-IMERG combinado com pluviômetros;
grade de 0,1°, 1998 até hoje). Arquivos usados:
  CLIMATOLOGY/MONTHLY_ACCUMULATED_YEARLY/MERGE_CPTEC_acum_<mes>_<ano>.nc   chuva acumulada de cada mês de cada ano
  DAILY/<ano>/<mes>/MERGE_CPTEC_<aaaammdd>.grib2                          chuva diária (12Z-12Z), para o mês que ainda
                                                                          não saiu no arquivo mensal

Metodologia (cada passo fica escrito no registro e no JSON):
  1. Recorte: caixa lon -53,0 a -38,0 / lat -25,0 a -12,5 (Minas + cerca de 150 km), grade original de 0,1°.
  2. Série mensal de cada ponto da grade, de jan/1998 ao último mês completo.
  3. Período-base: 1998 a 2025 (28 anos completos do MERGE). A OMM recomenda 1991-2020, mas o MERGE começa em 1998;
     a diferença fica avisada na ferramenta.
  4. Para cada mês e para as somas de 1, 3 e 6 meses: distribuição gama ajustada por máxima verossimilhança
     (aproximação de Thom) nos anos-base com chuva; meses secos entram como probabilidade de zero (p0).
     Probabilidade acumulada H = p0 + (1 - p0) * G(x). SPI = inversa da normal padrão de H (McKee et al., 1993; OMM-No. 1090).
  5. Percentil do mês = 100 * H (1 mês). Categoria por tercis: H < 1/3 abaixo, 1/3 a 2/3 normal, > 2/3 acima.
  6. Climatologia = média dos anos-base; anomalia em mm e em %.
  7. Resumo de Minas (resumo.json, todos os meses desde 1998): média ponderada pela área (cos da latitude) dos pontos da
     grade cujo centro cai dentro de Minas (mesorregiões de mapas-climaticos/meso.js); fração da área em cada categoria.
Saída: monitor-climatico/dados/merge/AAAA-MM.json (um por mês), indice.json e resumo.json. Valores inteiros (x10).
"""
import json, os, re, sys, time, urllib.request, datetime, math
import numpy as np
from scipy import stats, special

BASE = 'https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/'
UA = {'User-Agent': 'ferramentas-meteorologia-patrick (SIMGE/IGAM, monitor climatico)'}
LON0, LON1, LAT0, LAT1 = -53.0, -38.0, -25.0, -12.5
MES_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
ANO_BASE = (1998, 2025)
PRIMEIRO_SAIDA = (2025, 1)   # meses com JSON gerado (os anteriores só entram na série)
OUT = sys.argv[1] if len(sys.argv) > 1 else 'monitor-climatico/dados/merge'
CACHE = sys.argv[2] if len(sys.argv) > 2 else '/tmp/merge-cache'
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)


def log(*a):
    print(*a, flush=True)


def baixar(url, destino, tentativas=4):
    if os.path.exists(destino) and os.path.getsize(destino) > 0:
        return destino
    for t in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                dados = r.read()
            tmp = destino + '.part'
            with open(tmp, 'wb') as f:
                f.write(dados)
            os.replace(tmp, destino)
            return destino
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            log('  tentativa', t + 1, url, e)
        except Exception as e:
            log('  tentativa', t + 1, url, e)
        time.sleep(5 * (t + 1))
    raise RuntimeError('falhou: ' + url)


GRADE = None   # (lats, lons) do recorte, conferidos em todos os arquivos


def recortar(lat, lon, campo):
    global GRADE
    lat = np.asarray(lat, float); lon = np.asarray(lon, float)
    if lon.max() > 180:
        lon = np.where(lon > 180, lon - 360, lon)
    campo = np.asarray(campo, float)
    if campo.shape != (lat.size, lon.size):
        if campo.shape == (lon.size, lat.size):
            campo = campo.T
        else:
            raise RuntimeError('forma inesperada %s (lat %d, lon %d)' % (campo.shape, lat.size, lon.size))
    iy = np.where((lat >= LAT0 - 1e-6) & (lat <= LAT1 + 1e-6))[0]
    ix = np.where((lon >= LON0 - 1e-6) & (lon <= LON1 + 1e-6))[0]
    la, lo = lat[iy], lon[ix]
    sub = campo[np.ix_(iy, ix)]
    if la[0] > la[-1]:   # norte -> sul vira sul -> norte
        la = la[::-1]; sub = sub[::-1, :]
    if GRADE is None:
        GRADE = (np.round(la, 3), np.round(lo, 3))
        log('  grade do recorte: %d x %d, lat %.2f..%.2f, lon %.2f..%.2f' % (la.size, lo.size, la[0], la[-1], lo[0], lo[-1]))
    elif la.size != GRADE[0].size or lo.size != GRADE[1].size or np.abs(la - GRADE[0]).max() > 0.01 or np.abs(lo - GRADE[1]).max() > 0.01:
        raise RuntimeError('grade diferente entre arquivos')
    sub = np.where((sub < -1) | (sub > 5000) | ~np.isfinite(sub), np.nan, sub)
    return sub


def ler_nc(caminho):
    import netCDF4
    with netCDF4.Dataset(caminho) as ds:
        nomes = list(ds.variables)
        vlat = next(n for n in nomes if n.lower() in ('lat', 'latitude', 'y'))
        vlon = next(n for n in nomes if n.lower() in ('lon', 'longitude', 'x'))
        cand = [n for n in nomes if n not in (vlat, vlon) and ds.variables[n].ndim >= 2]
        v = ds.variables[cand[0]]
        v.set_auto_mask(True)
        a = np.ma.filled(np.ma.asarray(v[:]).astype(float), np.nan)
        while a.ndim > 2:
            a = a[0]
        return recortar(ds.variables[vlat][:], ds.variables[vlon][:], a), cand[0]


def ler_grib_dia(caminho):
    """1ª mensagem do GRIB2 diário = PREC (ordem do .ctl do CPTEC: PREC, NEST)."""
    import eccodes
    with open(caminho, 'rb') as f:
        h = eccodes.codes_grib_new_from_file(f)
        if h is None:
            raise RuntimeError('GRIB vazio: ' + caminho)
        try:
            ni, nj = eccodes.codes_get(h, 'Ni'), eccodes.codes_get(h, 'Nj')
            vals = eccodes.codes_get_values(h).reshape(nj, ni)
            la1, lo1 = eccodes.codes_get(h, 'latitudeOfFirstGridPointInDegrees'), eccodes.codes_get(h, 'longitudeOfFirstGridPointInDegrees')
            la2, lo2 = eccodes.codes_get(h, 'latitudeOfLastGridPointInDegrees'), eccodes.codes_get(h, 'longitudeOfLastGridPointInDegrees')
            miss = eccodes.codes_get(h, 'missingValue')
            vals = np.where(vals == miss, np.nan, vals)
            return recortar(np.linspace(la1, la2, nj), np.linspace(lo1, lo2, ni), vals)
        finally:
            eccodes.codes_release(h)


def mes_por_diarios(ano, mes):
    """Soma os diários do mês (só se todos os dias existirem)."""
    n = (datetime.date(ano + (mes == 12), mes % 12 + 1, 1) - datetime.date(ano, mes, 1)).days
    soma = None
    for d in range(1, n + 1):
        nome = 'MERGE_CPTEC_%04d%02d%02d.grib2' % (ano, mes, d)
        c = baixar('%sDAILY/%04d/%02d/%s' % (BASE, ano, mes, nome), os.path.join(CACHE, nome))
        if c is None:
            log('  %04d-%02d: falta o dia %d no MERGE diário; mês ainda incompleto' % (ano, mes, d))
            return None
        x = ler_grib_dia(c)
        soma = x if soma is None else soma + x
    return soma


def serie_mensal(ate):
    """Série jan/1998..ate (ano, mês). Mês sem arquivo mensal: soma dos diários. Devolve (meses, cubo[t, y, x], fontes)."""
    meses, cubo, fontes = [], [], []
    a, m = 1998, 1
    while (a, m) <= ate:
        nome = 'MERGE_CPTEC_acum_%s_%04d.nc' % (MES_EN[m - 1], a)
        c = baixar(BASE + 'CLIMATOLOGY/MONTHLY_ACCUMULATED_YEARLY/' + nome, os.path.join(CACHE, nome))
        if c is not None:
            x, var = ler_nc(c); fonte = 'mensal (' + var + ')'
        else:
            x = mes_por_diarios(a, m); fonte = 'soma dos diários'
            if x is None:
                break
        meses.append((a, m)); cubo.append(x.astype(np.float32)); fontes.append(fonte)
        m += 1
        if m > 12:
            a, m = a + 1, 1
    return meses, np.array(cubo), fontes


def ajuste_gama(amostra):
    """amostra [anos, pontos] -> alpha, beta, p0 por ponto (Thom; pelo menos 10 anos com chuva)."""
    x = np.where(amostra > 0.05, amostra, np.nan)
    n = np.sum(np.isfinite(amostra), 0)
    nz = np.sum(np.isfinite(x), 0)
    p0 = np.where(n > 0, (n - nz) / np.maximum(n, 1), np.nan)
    media = np.nanmean(x, 0)
    A = np.log(media) - np.nanmean(np.log(x), 0)
    A = np.where(A > 1e-6, A, 1e-6)
    alpha = (1 + np.sqrt(1 + 4 * A / 3)) / (4 * A)
    beta = media / alpha
    ok = nz >= 10
    return np.where(ok, alpha, np.nan), np.where(ok, beta, np.nan), np.where(ok, p0, np.nan)


def prob(x, alpha, beta, p0):
    G = special.gammainc(alpha, np.maximum(x, 0) / beta)
    H = np.where(x <= 0.05, p0, p0 + (1 - p0) * G)
    return np.clip(H, 1e-6, 1 - 1e-6)


def mascara_mg(lats, lons):
    txt = open('mapas-climaticos/meso.js', encoding='utf-8').read()
    gj = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    def dentro(x, y, anel):
        c = False; n = len(anel); j = n - 1
        for i in range(n):
            xi, yi = anel[i]; xj, yj = anel[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                c = not c
            j = i
        return c
    polys = []
    for f in gj['features']:
        g = f['geometry']
        for p in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']):
            polys.append(p)
    m = np.zeros((lats.size, lons.size), bool)
    for iy, la in enumerate(lats):
        for ix, lo in enumerate(lons):
            for p in polys:
                if dentro(lo, la, p[0]) and not any(dentro(lo, la, h) for h in p[1:]):
                    m[iy, ix] = True; break
    return m


def arr(v, k=10):
    out = []
    for z in np.asarray(v, float).ravel():
        out.append(None if not np.isfinite(z) else int(round(z * k)))
    return out


def main():
    hoje = datetime.date.today()
    ultimo = (hoje.year, hoje.month - 1) if hoje.month > 1 else (hoje.year - 1, 12)
    log('MERGE — até', ultimo, '— recorte', (LON0, LON1, LAT0, LAT1))
    meses, cubo, fontes = serie_mensal(ultimo)
    if not meses:
        raise SystemExit('nenhum mês lido')
    log('série: %d meses (%04d-%02d a %04d-%02d); fontes: %s' % (len(meses), *meses[0], *meses[-1], {f: fontes.count(f) for f in set(fontes)}))
    T, ny, nx = cubo.shape
    flat = cubo.reshape(T, -1)
    idx = {mm: i for i, mm in enumerate(meses)}
    indice = []
    masc = mascara_mg(GRADE[0], GRADE[1]).ravel()
    peso = np.repeat(np.cos(np.radians(GRADE[0])), nx)[masc]
    log('máscara de Minas: %d pontos de 0,1°' % masc.sum())
    def media_mg(v):
        v = np.asarray(v, float)[masc]; ok = np.isfinite(v)
        return float(np.sum(v[ok] * peso[ok]) / np.sum(peso[ok])) if ok.any() else None
    resumo = []
    for (a, m) in meses:
        i = idx[(a, m)]
        linha = {'p': '%04d-%02d' % (a, m), 'acum': None}
        for k in (1, 3, 6):
            if i - k + 1 < 0:
                continue
            atual = flat[i - k + 1:i + 1].sum(0)
            hist = np.array([flat[j - k + 1:j + 1].sum(0) for j in (idx.get((ab, m)) for ab in range(ANO_BASE[0], ANO_BASE[1] + 1)) if j is not None and j - k + 1 >= 0])
            al, be, p0 = ajuste_gama(hist)
            H = prob(atual, al, be, p0)
            linha['spi%d' % k] = media_mg(stats.norm.ppf(H))
            if k == 1:
                clim = np.nanmean(hist, 0)
                linha['acum'] = media_mg(atual); linha['clim'] = media_mg(clim)
                hm = H[masc]; ok = np.isfinite(hm); pw = peso[ok]; hm = hm[ok]
                cortes = [0, 0.1, 1 / 3, 2 / 3, 0.9, 1.01]
                linha['cat'] = [round(float(pw[(hm >= cortes[c]) & (hm < cortes[c + 1])].sum() / pw.sum()), 4) for c in range(5)]
        for kk in list(linha):
            if isinstance(linha[kk], float):
                linha[kk] = round(linha[kk], 2)
        resumo.append(linha)
    with open(os.path.join(OUT, 'resumo.json'), 'w') as f:
        json.dump({'fonte': 'MERGE/CPTEC-INPE', 'base': '%d-%d' % ANO_BASE, 'area': 'Minas Gerais (pontos de 0,1° com centro no estado; média ponderada por cos(lat))',
                   'categorias': ['muito abaixo (H<0,1)', 'abaixo (0,1-1/3)', 'normal (1/3-2/3)', 'acima (2/3-0,9)', 'muito acima (>0,9)'], 'meses': resumo}, f, ensure_ascii=False, separators=(',', ':'))
    log('resumo.json: %d meses' % len(resumo))
    for (a, m) in meses:
        if (a, m) < PRIMEIRO_SAIDA:
            continue
        i = idx[(a, m)]
        camadas = {}
        for k in (1, 3, 6):
            if i - k + 1 < 0:
                continue
            atual = flat[i - k + 1:i + 1].sum(0)
            hist = []
            for ab in range(ANO_BASE[0], ANO_BASE[1] + 1):
                j = idx.get((ab, m))
                if j is None or j - k + 1 < 0:
                    continue
                hist.append(flat[j - k + 1:j + 1].sum(0))
            hist = np.array(hist)
            al, be, p0 = ajuste_gama(hist)
            H = prob(atual, al, be, p0)
            spi = stats.norm.ppf(H)
            camadas['spi%d' % k] = arr(np.clip(spi, -3.5, 3.5), 100)
            if k == 1:
                clim = np.nanmean(hist, 0)
                camadas.update({
                    'acum': arr(atual), 'clim': arr(clim),
                    'anom': arr(atual - clim),
                    'anomPct': arr(np.where(clim > 1, 100 * (atual - clim) / clim, np.nan)),
                    'pct': arr(100 * H),
                    'alpha': arr(al, 1000), 'beta': arr(be, 100), 'p0': arr(p0, 1000)})
                nbase = hist.shape[0]
        doc = {'fonte': 'MERGE/CPTEC-INPE (GPM-IMERG + pluviômetros), 0,1°', 'mes': m, 'ano': a,
               'origem': fontes[i], 'base': '%d-%d (%d anos)' % (ANO_BASE[0], ANO_BASE[1], nbase),
               'grade': {'lon0': float(GRADE[1][0]), 'lat0': float(GRADE[0][0]), 'd': 0.1, 'nx': int(nx), 'ny': int(ny), 'ordem': 'linhas de sul para norte, oeste para leste'},
               'escala': {'acum': 10, 'clim': 10, 'anom': 10, 'anomPct': 10, 'pct': 10, 'spi1': 100, 'spi3': 100, 'spi6': 100, 'alpha': 1000, 'beta': 100, 'p0': 1000},
               'metodo': 'gama (Thom) por ponto e por mês nos anos-base; H = p0 + (1-p0)G; SPI = Φ⁻¹(H); percentil = 100H; tercis em H',
               'gerado': datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC'), 'camadas': camadas}
        nome = '%04d-%02d.json' % (a, m)
        with open(os.path.join(OUT, nome), 'w') as f:
            json.dump(doc, f, separators=(',', ':'))
        v = np.array([z for z in camadas['acum'] if z is not None]) / 10
        log('  %s: %s; acumulado na caixa %.0f a %.0f mm (média %.0f)' % (nome, fontes[i], v.min(), v.max(), v.mean()))
        indice.append({'mes': m, 'ano': a, 'arquivo': nome, 'origem': fontes[i]})
    with open(os.path.join(OUT, 'indice.json'), 'w') as f:
        json.dump({'meses': indice, 'atualizado': datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}, f, ensure_ascii=False, indent=0)
    log('ok:', len(indice), 'meses gravados')


if __name__ == '__main__':
    main()
