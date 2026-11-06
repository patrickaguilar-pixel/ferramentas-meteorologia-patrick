#!/usr/bin/env python3
"""Curto Prazo: baixa a chuva prevista do GFS (NOAA) e do WRF 7 km (CPTEC/INPE) e grava,
para cada modelo, um JSON com a MESMA estrutura (curto-prazo/dados/<gfs|wrf>.json).

Janela (igual à validade dos mapas: "VÁLIDO: 09h DD/MM às 09h DD/MM, hora local")
  Rodada 00Z do dia D.  12Z = 09h em Brasília.
    24h = 12Z D -> 12Z D+1   (f036 - f012)
    48h = 12Z D -> 12Z D+2   (f060 - f012)
    72h = 12Z D -> 12Z D+3   (f084 - f012)
  Os dois modelos trazem a chuva acumulada desde o início da rodada (APCP 0-XX h);
  a chuva da janela é a diferença entre dois acumulados.

De onde vem (só estes dois endereços; redirecionamento para fora é recusado)
  GFS: https://nomads.ncep.noaa.gov  filtro oficial filter_gfs_0p25.pl, só APCP e só o recorte de MG.
  WRF: https://dataserver.cptec.inpe.br  .../wrf/ams_07km/brutos/AAAA/MM/DD/HH/WRF_cpt_07KM_<rodada>_<validade>.grib2
       Primeiro o inventário (.inv, texto pequeno); depois só o trecho do GRIB2 com a APCP,
       por "byte-range" (o servidor tem de responder 206; se responder o arquivo inteiro, para).

Estrutura do JSON (igual para os dois modelos)
  modelo, fonte, ciclo, data_ciclo, rodada_utc, baixado_em, unidade "mm", janela,
  grade {lat0 (norte), lon0 (oeste), dlat, dlon (graus, positivos), nlat, nlon}  -> regular, linhas do norte para o sul
  produtos {"24h"|"48h"|"72h": {de_utc, ate_utc, inicio_local, fim_local, max_mm, mm: [[...], ...]}}
  arquivos [{h, bytes, sha256}]

Cuidados (os mesmos do GFS de Reservatórios, mais os do byte-range)
  - Cada mensagem tem de ser um GRIB2 completo ("GRIB" ... "7777") e menor que o limite.
  - ecCodes (ECMWF) lê a mensagem; confere que é APCP pela tabela da OMM (0/1/8, acumulado)
    e que o período é exatamente 0-XX h.
  - Grade regular (lat/lon) e igual em todos os arquivos do modelo.
  - Valores finitos, sem negativos, limites físicos; 24h <= 48h <= 72h em todos os pontos;
    o acumulado desde 0 h nunca diminui (f012 <= f036 <= f060 <= f084).
  - Um modelo que falhar não afeta o outro; o JSON anterior continua até chegar uma rodada nova válida.
  - Grava em arquivo temporário e troca de uma vez (a página nunca vê um JSON pela metade).
  - curto-prazo/dados/status.json registra o resultado da última tentativa de cada modelo
    (para a página e para a conferência); só é regravado quando o resultado muda.

Uso: python3 -I scripts/baixar_curto_prazo.py curto-prazo/dados
     REPROCESSAR=1 refaz a rodada mais recente mesmo que já exista.
"""
import hashlib
import importlib.util
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
UA = "SIMGE-IGAM ferramentas-meteorologia (GitHub Actions; dados publicos GFS/NOMADS e WRF/CPTEC)"
CICLO = "00"
HORAS = [12, 36, 60, 84]                       # acumulados desde 0 h usados nas janelas
PRODUTOS = {"24h": (12, 36), "48h": (12, 60), "72h": (12, 84)}
# recorte comum aos dois modelos (MG inteira com ~0,5° de folga para a interpolação nas bordas)
CAIXA = {"oeste": -52.0, "leste": -39.0, "norte": -13.5, "sul": -23.5}
LIMITE_JANELA_MM = {"24h": 600.0, "48h": 1000.0, "72h": 1500.0}
LIMITE_ACUM_MM = 2000.0
TOL_MM = 0.3
BRT = timezone(timedelta(hours=-3))           # Brasília (sem horário de verão desde 2019)

GFS_HOST = "nomads.ncep.noaa.gov"
GFS_FILTRO = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
GFS_REGIAO = {"leftlon": "307.5", "rightlon": "321.5", "toplat": "-13", "bottomlat": "-24.5"}
GFS_TAM_MAX = 2 * 1024 * 1024
GFS_ATRASO_H = 4.0

WRF_HOST = "dataserver.cptec.inpe.br"
WRF_BASE = "https://dataserver.cptec.inpe.br/dataserver_modelos/wrf/ams_07km/brutos"
WRF_TAM_MAX = 40 * 1024 * 1024                # uma mensagem APCP da América do Sul a 7 km tem poucos MB
WRF_INV_MAX = 2 * 1024 * 1024
WRF_ATRASO_H = 3.0
PAUSA_S = 1.5


class Indisponivel(Exception):
    """O arquivo da rodada ainda não está publicado."""


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- rede
def _abrir(url, host, cabecalhos=None, metodo="GET"):
    p = urllib.parse.urlparse(url)
    if p.scheme != "https" or p.netloc != host:
        raise ValueError(f"endereço recusado: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(cabecalhos or {})}, method=metodo)
    r = urllib.request.urlopen(req, timeout=120)
    final = urllib.parse.urlparse(r.geturl())
    if final.scheme != "https" or final.netloc != host:
        r.close()
        raise ValueError(f"redirecionamento para fora de {host} recusado: {r.geturl()}")
    return r


def _tentar(func, descricao):
    ultimo = None
    for t in range(3):
        try:
            return func()
        except Indisponivel:
            raise
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise Indisponivel(f"{descricao}: HTTP 404")
            ultimo = e
        except ValueError as e:
            if "recusad" in str(e) or "206" in str(e) or "limite" in str(e):
                raise
            ultimo = e
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            ultimo = e
        time.sleep(5 + 10 * t)
    raise RuntimeError(f"{descricao}: falha depois de 3 tentativas: {ultimo}")


def checar_grib(dados, limite):
    if len(dados) > limite:
        raise ValueError("mensagem maior que o limite")
    if dados[:4] != b"GRIB":
        raise ValueError("o trecho baixado não começa com 'GRIB'")
    if dados[-4:] != b"7777":
        raise ValueError("GRIB incompleto (sem o fim '7777')")
    if dados[7] != 2:
        raise ValueError("não é GRIB edição 2")


# ---------------------------------------------------------------- leitura (ecCodes)
def executar(args, timeout=300):
    r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{args[0]} falhou: {r.stderr.strip()[:300]}")
    return r.stdout


FATOR_H = {"m": 1 / 60, "0": 1 / 60, "h": 1, "1": 1, "D": 24, "d": 24, "2": 24, "3h": 3, "10": 3, "6h": 6, "11": 6, "12h": 12, "12": 12}


def ler_apcp(caminho, inicio_h, fim_h):
    """Lê a mensagem APCP de 'inicio_h' a 'fim_h' horas e devolve (grade, matriz) já recortada na CAIXA."""
    chaves = ("count,discipline,parameterCategory,parameterNumber,typeOfStatisticalProcessing,"
              "stepUnits,startStep,endStep,gridType,Ni,Nj")
    info = json.loads(executar(["grib_ls", "-j", "-p", chaves, caminho]))
    msgs = info.get("messages", []) if isinstance(info, dict) else info
    achou, vistos = None, []
    for m in msgs:
        if isinstance(m, list):
            m = {d["key"]: d["value"] for d in m}
        if (str(m.get("discipline")), str(m.get("parameterCategory")), str(m.get("parameterNumber")),
                str(m.get("typeOfStatisticalProcessing"))) != ("0", "1", "8", "1"):
            continue
        u = str(m.get("stepUnits", "h"))
        if u not in FATOR_H:
            raise ValueError(f"unidade de tempo desconhecida: {u}")
        ini, fim = float(m["startStep"]) * FATOR_H[u], float(m["endStep"]) * FATOR_H[u]
        vistos.append((ini, fim))
        if abs(ini - inicio_h) < 1e-6 and abs(fim - fim_h) < 1e-6:
            achou = m
    if achou is None:
        raise ValueError(f"APCP {inicio_h}-{fim_h} h não encontrada (períodos no arquivo: {vistos})")
    if achou.get("gridType") != "regular_ll":
        raise ValueError(f"grade '{achou.get('gridType')}' não suportada (esperado regular_ll)")
    ni, nj = int(achou["Ni"]), int(achou["Nj"])
    txt = executar(["grib_get_data", "-w", f"count={achou['count']}", "-F", "%.3f", caminho])
    pts, total = [], 0
    for linha in txt.splitlines():
        p = linha.split()
        if len(p) != 3 or p[0][:1].isalpha():
            continue
        total += 1
        la, lo, v = float(p[0]), float(p[1]), float(p[2])
        if lo > 180:
            lo -= 360
        if CAIXA["oeste"] - 1e-6 <= lo <= CAIXA["leste"] + 1e-6 and CAIXA["sul"] - 1e-6 <= la <= CAIXA["norte"] + 1e-6:
            pts.append((la, lo, v))
    if total != ni * nj:
        raise ValueError(f"número de pontos inesperado ({total} em vez de {ni}x{nj})")
    if not pts:
        raise ValueError("nenhum ponto da grade dentro do recorte de MG")
    return montar(pts)


def montar(pts):
    la = sorted({round(p[0], 4) for p in pts}, reverse=True)
    lo = sorted({round(p[1], 4) for p in pts})
    if len(la) * len(lo) != len(pts):
        raise ValueError("grade irregular dentro do recorte")
    def passo(seq):
        d = [abs(seq[i + 1] - seq[i]) for i in range(len(seq) - 1)]
        med = sum(d) / len(d)
        if any(abs(x - med) > max(0.002, med * 0.02) for x in d):
            raise ValueError("espaçamento da grade não é uniforme")
        return med
    dlat, dlon = passo(la), passo(lo)
    ia = {v: i for i, v in enumerate(la)}
    io = {v: i for i, v in enumerate(lo)}
    m = [[None] * len(lo) for _ in la]
    for a, o, v in pts:
        if not math.isfinite(v):
            raise ValueError("valor não numérico na grade")
        if v < -0.05 or v > LIMITE_ACUM_MM:
            raise ValueError(f"valor fora do limite físico: {v}")
        m[ia[round(a, 4)]][io[round(o, 4)]] = max(0.0, v)
    if any(x is None for linha in m for x in linha):
        raise ValueError("grade com pontos faltando")
    grade = {"lat0": la[0], "lon0": lo[0], "dlat": round(dlat, 6), "dlon": round(dlon, 6), "nlat": len(la), "nlon": len(lo)}
    return grade, m


# ---------------------------------------------------------------- GFS
def gfs_baixar(data, h):
    q = {"dir": f"/gfs.{data:%Y%m%d}/{CICLO}/atmos", "file": f"gfs.t{CICLO}z.pgrb2.0p25.f{h:03d}",
         "var_APCP": "on", "lev_surface": "on", "subregion": "", **GFS_REGIAO}
    url = GFS_FILTRO + "?" + urllib.parse.urlencode(q)
    def f():
        with _abrir(url, GFS_HOST) as r:
            dados = r.read(GFS_TAM_MAX + 1)
        if dados[:4] != b"GRIB":
            txt = dados[:400].decode("latin-1", "replace").lower()
            if any(s in txt for s in ("not present", "not available", "no such", "does not exist")):
                raise Indisponivel(f"GFS f{h:03d}: {txt.strip()[:120]}")
        checar_grib(dados, GFS_TAM_MAX)
        return dados
    return _tentar(f, f"GFS f{h:03d}")


# ---------------------------------------------------------------- WRF
def wrf_nome(run, h):
    return f"WRF_cpt_07KM_{run:%Y%m%d%H}_{run + timedelta(hours=h):%Y%m%d%H}"


def wrf_pasta(run):
    return f"{WRF_BASE}/{run:%Y}/{run:%m}/{run:%d}/{run:%H}"


def parse_inv(texto):
    regs = []
    for ln in texto.splitlines():
        p = ln.strip().split(":")
        if len(p) < 6:
            continue
        try:
            num, off = int(p[0]), int(p[1])
        except ValueError:
            continue
        regs.append({"num": num, "offset": off, "var": p[3].strip(), "nivel": p[4].strip(),
                     "periodo": ":".join(p[5:]).strip(), "linha": ln.strip()})
    return regs


def periodo_horas(txt):
    """'0-12 hour acc fcst' -> (0, 12); '0-1 day acc fcst' -> (0, 24); senão None."""
    m = re.search(r"(\d+)\s*-\s*(\d+)\s*(hour|day|min)\s+acc", txt.lower())
    if not m:
        return None
    f = {"hour": 1, "day": 24, "min": 1 / 60}[m.group(3)]
    return int(m.group(1)) * f, int(m.group(2)) * f


def wrf_baixar(run, h):
    pasta, base = wrf_pasta(run), wrf_nome(run, h)
    url_inv, url_grib = f"{pasta}/{base}.inv", f"{pasta}/{base}.grib2"
    def ler_inv():
        with _abrir(url_inv, WRF_HOST) as r:
            t = r.read(WRF_INV_MAX + 1)
        if len(t) > WRF_INV_MAX:
            raise ValueError("inventário maior que o limite")
        return t.decode("latin-1")
    regs = parse_inv(_tentar(ler_inv, f"WRF f{h:03d} .inv"))
    if not regs:
        raise ValueError(f"WRF f{h:03d}: inventário vazio ou em formato desconhecido")
    cand = [r for r in regs if r["var"].upper() == "APCP" and r["nivel"].lower() == "surface"
            and periodo_horas(r["periodo"]) == (0, h)]
    if len(cand) != 1:
        apcp = [r["linha"] for r in regs if r["var"].upper() == "APCP"]
        raise ValueError(f"WRF f{h:03d}: esperava 1 APCP:surface 0-{h} h acumulada no .inv, achei {len(cand)} (linhas APCP: {apcp[:4]})")
    alvo = cand[0]
    offs = sorted({r["offset"] for r in regs})
    prox = [o for o in offs if o > alvo["offset"]]
    if prox:
        fim = prox[0] - 1
    else:
        def tam():
            with _abrir(url_grib, WRF_HOST, metodo="HEAD") as r:
                n = r.headers.get("Content-Length")
            if not n:
                raise ValueError("servidor não informou o tamanho do GRIB")
            return int(n) - 1
        fim = _tentar(tam, f"WRF f{h:03d} HEAD")
    ini = alvo["offset"]
    if fim < ini or fim - ini + 1 > WRF_TAM_MAX:
        raise ValueError(f"WRF f{h:03d}: trecho {ini}-{fim} fora do limite")
    def f():
        with _abrir(url_grib, WRF_HOST, {"Range": f"bytes={ini}-{fim}"}) as r:
            if r.status != 206:
                raise ValueError(f"servidor respondeu {r.status} em vez de 206 (byte-range): não baixo o arquivo inteiro")
            cr = r.headers.get("Content-Range", "")
            if not cr.startswith(f"bytes {ini}-{fim}/"):
                raise ValueError(f"Content-Range inesperado: {cr!r} (esperado bytes {ini}-{fim}/…; não aceito por segurança — 206)")
            dados = r.read(WRF_TAM_MAX + 1)
        if len(dados) != fim - ini + 1:
            raise ValueError(f"tamanho recebido {len(dados)} diferente do pedido {fim - ini + 1}")
        checar_grib(dados, WRF_TAM_MAX)
        return dados
    return _tentar(f, f"WRF f{h:03d} GRIB"), alvo["linha"]


# ---------------------------------------------------------------- processamento comum
def processar(modelo, data, destino):
    run = datetime(data.year, data.month, data.day, int(CICLO), tzinfo=timezone.utc)
    acum, arquivos, grade, inv = {}, [], None, []
    with tempfile.TemporaryDirectory() as tmp:
        for h in sorted(HORAS, reverse=True):        # o último horizonte primeiro: se não saiu, nem continua
            if modelo == "gfs":
                dados = gfs_baixar(data, h)
            else:
                dados, linha = wrf_baixar(run, h)
                inv.append(f"f{h:03d}: {linha}")
            arquivos.append({"h": h, "bytes": len(dados), "sha256": hashlib.sha256(dados).hexdigest()})
            cam = os.path.join(tmp, f"f{h:03d}.grib2")
            with open(cam, "wb") as f:
                f.write(dados)
            g, m = ler_apcp(cam, 0, h)
            if grade is None:
                grade = g
            elif g != grade:
                raise ValueError(f"grade diferente em f{h:03d}: {g} x {grade}")
            acum[h] = m
            time.sleep(PAUSA_S)
    # o acumulado desde 0 h não pode diminuir
    for a, b in zip(HORAS, HORAS[1:]):
        pior = max(x - y for la, lb in zip(acum[a], acum[b]) for x, y in zip(la, lb))
        if pior > TOL_MM:
            raise ValueError(f"acumulado f{a:03d} maior que f{b:03d} em {pior:.1f} mm: dado inconsistente")
    produtos = {}
    for k, (a, b) in PRODUTOS.items():
        mm = [[round(max(0.0, y - x), 1) for x, y in zip(la, lb)] for la, lb in zip(acum[a], acum[b])]
        mx = max(max(l) for l in mm)
        if mx > LIMITE_JANELA_MM[k]:
            raise ValueError(f"{k}: máximo {mx:.1f} mm acima do limite físico")
        de, ate = run + timedelta(hours=a), run + timedelta(hours=b)
        produtos[k] = {"de_utc": de.strftime("%Y-%m-%dT%H:%MZ"), "ate_utc": ate.strftime("%Y-%m-%dT%H:%MZ"),
                       "inicio_local": de.astimezone(BRT).strftime("%Y-%m-%dT%H:%M-03:00"),
                       "fim_local": ate.astimezone(BRT).strftime("%Y-%m-%dT%H:%M-03:00"),
                       "max_mm": round(mx, 1), "mm": mm}
    ks = list(PRODUTOS)
    for p, q in zip(ks, ks[1:]):
        if any(x > y + TOL_MM for lx, ly in zip(produtos[p]["mm"], produtos[q]["mm"]) for x, y in zip(lx, ly)):
            raise ValueError(f"{p} maior que {q} em algum ponto: dado inconsistente")
    saida = {
        "versao": 1,
        "modelo": "GFS" if modelo == "gfs" else "WRF",
        "fonte": ("NOAA/NCEP GFS 0,25° — NOMADS (filter_gfs_0p25), APCP" if modelo == "gfs"
                  else "CPTEC/INPE WRF 7 km (ams_07km) — dataserver, APCP por byte-range"),
        "ciclo": CICLO,
        "data_ciclo": f"{data:%Y-%m-%d}",
        "rodada_utc": run.strftime("%Y-%m-%dT%H:%MZ"),
        "baixado_em": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "unidade": "mm",
        "janela": "09h às 09h, hora local (12Z–12Z); chuva da janela = APCP(0–fim) − APCP(0–12 h)",
        "grade": grade,
        "produtos": produtos,
        "arquivos": sorted(arquivos, key=lambda x: x["h"]),
    }
    if inv:
        saida["inventario"] = sorted(inv)
    os.makedirs(destino, exist_ok=True)
    final = os.path.join(destino, f"{modelo}.json")
    tmpf = final + ".tmp"
    with open(tmpf, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmpf, final)
    log(f"  gravado {final} ({os.path.getsize(final) / 1024:.0f} KB); grade {grade['nlat']}x{grade['nlon']} "
        f"(passo {grade['dlat']}°); máximos: " + ", ".join(f"{k} {v['max_mm']} mm" for k, v in produtos.items()))


def data_atual(destino, modelo):
    try:
        with open(os.path.join(destino, f"{modelo}.json"), encoding="utf-8") as f:
            return json.load(f).get("data_ciclo")
    except (OSError, ValueError):
        return None


def gravar_status(destino, status):
    cam = os.path.join(destino, "status.json")
    try:
        with open(cam, encoding="utf-8") as f:
            antigo = json.load(f)
    except (OSError, ValueError):
        antigo = {}
    sem_hora = lambda s: {k: {kk: vv for kk, vv in v.items() if kk != "em"} for k, v in s.items()}
    if sem_hora(antigo) == sem_hora(status):
        return
    os.makedirs(destino, exist_ok=True)
    with open(cam + ".tmp", "w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=1)
    os.replace(cam + ".tmp", cam)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    destino = sys.argv[1]
    agora = datetime.now(timezone.utc)
    status, erros = {}, 0
    for modelo, atraso in (("gfs", GFS_ATRASO_H), ("wrf", WRF_ATRASO_H)):
        atual = None if os.environ.get("REPROCESSAR") == "1" else data_atual(destino, modelo)
        st = {"resultado": "sem rodada nova", "em": agora.strftime("%Y-%m-%dT%H:%MZ")}
        for d in (agora.date(), agora.date() - timedelta(days=1)):
            if atual and atual >= f"{d:%Y-%m-%d}":
                log(f"{modelo.upper()}: já temos a rodada de {atual}.")
                st = {"resultado": "ok", "rodada": atual, "em": st["em"]}
                break
            if agora < datetime(d.year, d.month, d.day, int(CICLO), tzinfo=timezone.utc) + timedelta(hours=atraso):
                continue
            log(f"{modelo.upper()}: tentando a rodada 00Z de {d:%Y-%m-%d}…")
            try:
                processar(modelo, d, destino)
                st = {"resultado": "ok", "rodada": f"{d:%Y-%m-%d}", "em": st["em"]}
                break
            except Indisponivel as e:
                log(f"  ainda não disponível ({e}).")
                st = {"resultado": "aguardando publicação", "rodada": f"{d:%Y-%m-%d}", "detalhe": str(e)[:300], "em": st["em"]}
            except Exception as e:   # mantém o JSON anterior deste modelo
                erros += 1
                log(f"  ERRO: {e}")
                st = {"resultado": "erro", "rodada": f"{d:%Y-%m-%d}", "detalhe": str(e)[:500], "em": st["em"]}
                break
        status[modelo] = st
    gravar_status(destino, status)
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
