#!/usr/bin/env python3
"""Umidade Mínima: baixa a umidade relativa a 2 m do WRF 7 km (CPTEC/INPE) às 18 UTC (15h, hora local)
dos 3 primeiros dias da rodada 00Z e grava umidade-minima/dados/wrf.json.

Mesmo cálculo do notebook da equipe (UR_media_18Z_WRF_MG_Colab):
  Rodada 00Z do dia D.  18 UTC = 15h em Brasília (o horário mais seco do dia).
    D   18 UTC = f018
    D+1 18 UTC = f042
    D+2 18 UTC = f066
  "UR mínima" do período = média simples dos três campos das 18 UTC (ponto a ponto).
  A suavização leve do notebook é só de visualização e fica na página (não no dado).

De onde vem (só este endereço; redirecionamento para fora é recusado)
  https://dataserver.cptec.inpe.br/dataserver_modelos/wrf/ams_07km/brutos/AAAA/MM/DD/00/WRF_cpt_07KM_<rodada>_<validade>.grib2
  Primeiro o inventário (.inv, texto pequeno); depois só o trecho do GRIB2 com a UR a 2 m,
  por "byte-range" (o servidor tem de responder 206; se responder o arquivo inteiro, para).
  O notebook baixa os arquivos inteiros (centenas de MB); aqui vem só ~1 MB por horário.

Estrutura do JSON
  versao, modelo, fonte, variavel, ciclo, data_ciclo, rodada_utc, baixado_em, unidade "%", horario,
  grade {lat0 (norte), lon0 (oeste), dlat, dlon, nlat, nlon}  -> regular, linhas do norte para o sul
  dias  [{h, valido_utc, valido_local, min, max, ur: [[...], ...]}]   (D, D+1, D+2)
  media {de_local, ate_local, min, max, ur: [[...], ...]}             (média dos três dias)
  arquivos [{h, bytes, sha256}], inventario [linhas do .inv usadas]

Cuidados (os mesmos do Curto Prazo)
  - Cada mensagem tem de ser um GRIB2 completo ("GRIB" ... "7777") e menor que o limite.
  - ecCodes (ECMWF) lê a mensagem; confere que é UR pela tabela da OMM (0/1/1), a 2 m acima do solo,
    da rodada certa (data e 00 UTC) e com o horizonte exato (18, 42 ou 66 h).
  - Grade regular (lat/lon) e igual nos três arquivos.
  - Valores finitos entre 0 e 100 % (aceita até 105 % e corta em 100, como o próprio modelo pode dar);
    campo que não varia (tudo igual) é recusado.
  - O JSON anterior continua até chegar uma rodada nova válida; grava em arquivo temporário e troca de uma vez.
  - umidade-minima/dados/status.json registra o resultado da última tentativa (só é regravado quando muda).

Ferramenta separada: não lê nem altera nada do Curto Prazo, de Reservatórios ou da Tendência.

Uso: python3 -I scripts/baixar_umidade_minima.py umidade-minima/dados
     REPROCESSAR=1 refaz a rodada mais recente mesmo que já exista.
"""
import hashlib
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

UA = "SIMGE-IGAM ferramentas-meteorologia (GitHub Actions; dados publicos WRF/CPTEC)"
CICLO = "00"
HORAS = [18, 42, 66]                           # 18 UTC de D, D+1 e D+2
CAIXA = {"oeste": -52.0, "leste": -39.0, "norte": -13.5, "sul": -23.5}   # MG com ~0,5° de folga
UR_MIN, UR_MAX = -0.5, 105.0                   # limites físicos aceitos (corta em 0 e 100)
BRT = timezone(timedelta(hours=-3))           # Brasília (sem horário de verão desde 2019)

WRF_HOST = "dataserver.cptec.inpe.br"
WRF_BASE = "https://dataserver.cptec.inpe.br/dataserver_modelos/wrf/ams_07km/brutos"
WRF_TAM_MAX = 40 * 1024 * 1024
WRF_INV_MAX = 2 * 1024 * 1024
WRF_ATRASO_H = 3.0
PAUSA_S = 1.5


class Indisponivel(Exception):
    """O arquivo da rodada ainda não está publicado."""


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- rede
def _abrir(url, cabecalhos=None, metodo="GET"):
    p = urllib.parse.urlparse(url)
    if p.scheme != "https" or p.netloc != WRF_HOST:
        raise ValueError(f"endereço recusado: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(cabecalhos or {})}, method=metodo)
    r = urllib.request.urlopen(req, timeout=120)
    final = urllib.parse.urlparse(r.geturl())
    if final.scheme != "https" or final.netloc != WRF_HOST:
        r.close()
        raise ValueError(f"redirecionamento para fora de {WRF_HOST} recusado: {r.geturl()}")
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


def checar_grib(dados):
    if len(dados) > WRF_TAM_MAX:
        raise ValueError("mensagem maior que o limite")
    if dados[:4] != b"GRIB":
        raise ValueError("o trecho baixado não começa com 'GRIB'")
    if dados[-4:] != b"7777":
        raise ValueError("GRIB incompleto (sem o fim '7777')")
    if dados[7] != 2:
        raise ValueError("não é GRIB edição 2")


# ---------------------------------------------------------------- inventário (.inv)
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


def horizonte(txt):
    """'18 hour fcst' -> 18; '1 day fcst' -> 24; 'anl' -> 0; senão None (acumulados/médias ficam de fora)."""
    t = txt.lower().strip().rstrip(":").strip()
    if t == "anl":
        return 0
    m = re.fullmatch(r"(\d+)\s*(hour|day|min)\s+fcst", t)
    if not m:
        return None
    return int(m.group(1)) * {"hour": 1, "day": 24, "min": 1 / 60}[m.group(2)]


def eh_ur_2m(r):
    return r["var"].upper() in ("RH", "2R") and re.fullmatch(r"2\s*m\s+above\s+ground", r["nivel"].lower()) is not None


# ---------------------------------------------------------------- WRF
def wrf_nome(run, h):
    return f"WRF_cpt_07KM_{run:%Y%m%d%H}_{run + timedelta(hours=h):%Y%m%d%H}"


def wrf_baixar(run, h):
    pasta = f"{WRF_BASE}/{run:%Y}/{run:%m}/{run:%d}/{run:%H}"
    base = wrf_nome(run, h)
    url_inv, url_grib = f"{pasta}/{base}.inv", f"{pasta}/{base}.grib2"

    def ler_inv():
        with _abrir(url_inv) as r:
            t = r.read(WRF_INV_MAX + 1)
        if len(t) > WRF_INV_MAX:
            raise ValueError("inventário maior que o limite")
        return t.decode("latin-1")

    regs = parse_inv(_tentar(ler_inv, f"WRF f{h:03d} .inv"))
    if not regs:
        raise ValueError(f"WRF f{h:03d}: inventário vazio ou em formato desconhecido")
    cand = [r for r in regs if eh_ur_2m(r) and horizonte(r["periodo"]) == h]
    if len(cand) != 1:
        urs = [r["linha"] for r in regs if r["var"].upper() in ("RH", "2R")]
        raise ValueError(f"WRF f{h:03d}: esperava 1 linha RH:2 m above ground:{h} hour fcst no .inv, "
                         f"achei {len(cand)} (linhas RH: {urs[:6]})")
    alvo = cand[0]
    offs = sorted({r["offset"] for r in regs})
    prox = [o for o in offs if o > alvo["offset"]]
    if prox:
        fim = prox[0] - 1
    else:
        def tam():
            with _abrir(url_grib, metodo="HEAD") as r:
                n = r.headers.get("Content-Length")
            if not n:
                raise ValueError("servidor não informou o tamanho do GRIB")
            return int(n) - 1
        fim = _tentar(tam, f"WRF f{h:03d} HEAD")
    ini = alvo["offset"]
    if fim < ini or fim - ini + 1 > WRF_TAM_MAX:
        raise ValueError(f"WRF f{h:03d}: trecho {ini}-{fim} fora do limite")

    def baixar():
        with _abrir(url_grib, {"Range": f"bytes={ini}-{fim}"}) as r:
            if r.status != 206:
                raise ValueError(f"servidor respondeu {r.status} em vez de 206 (byte-range): não baixo o arquivo inteiro")
            cr = r.headers.get("Content-Range", "")
            if not cr.startswith(f"bytes {ini}-{fim}/"):
                raise ValueError(f"Content-Range inesperado: {cr!r} (esperado bytes {ini}-{fim}/…; não aceito por segurança — 206)")
            dados = r.read(WRF_TAM_MAX + 1)
        if len(dados) != fim - ini + 1:
            raise ValueError(f"tamanho recebido {len(dados)} diferente do pedido {fim - ini + 1}")
        checar_grib(dados)
        return dados

    return _tentar(baixar, f"WRF f{h:03d} GRIB"), alvo["linha"]


# ---------------------------------------------------------------- leitura (ecCodes)
def executar(args, timeout=300):
    r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{args[0]} falhou: {r.stderr.strip()[:300]}")
    return r.stdout


FATOR_H = {"m": 1 / 60, "0": 1 / 60, "h": 1, "1": 1, "D": 24, "d": 24, "2": 24, "3h": 3, "10": 3, "6h": 6, "11": 6, "12h": 12, "12": 12}


def ler_ur(caminho, run, h):
    """Lê a UR a 2 m da rodada 'run' no horizonte 'h' e devolve (grade, matriz) recortada na CAIXA."""
    chaves = ("count,discipline,parameterCategory,parameterNumber,typeOfLevel,level,"
              "stepUnits,endStep,dataDate,dataTime,gridType,Ni,Nj")
    info = json.loads(executar(["grib_ls", "-j", "-p", chaves, caminho]))
    msgs = info.get("messages", []) if isinstance(info, dict) else info
    achou, vistos = None, []
    for m in msgs:
        if isinstance(m, list):
            m = {d["key"]: d["value"] for d in m}
        if (str(m.get("discipline")), str(m.get("parameterCategory")), str(m.get("parameterNumber"))) != ("0", "1", "1"):
            continue
        u = str(m.get("stepUnits", "h"))
        if u not in FATOR_H:
            raise ValueError(f"unidade de tempo desconhecida: {u}")
        passo = float(m["endStep"]) * FATOR_H[u]
        vistos.append((m.get("typeOfLevel"), m.get("level"), passo))
        if str(m.get("typeOfLevel")) == "heightAboveGround" and str(m.get("level")) == "2" and abs(passo - h) < 1e-6:
            achou = m
    if achou is None:
        raise ValueError(f"UR a 2 m em +{h} h não encontrada (mensagens de UR no trecho: {vistos})")
    if str(achou.get("dataDate")) != f"{run:%Y%m%d}" or int(achou.get("dataTime", -1)) != run.hour * 100:
        raise ValueError(f"rodada errada no GRIB: {achou.get('dataDate')} {achou.get('dataTime')} (esperado {run:%Y%m%d} {run:%H}00)")
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
        if v < UR_MIN or v > UR_MAX:
            raise ValueError(f"UR fora do limite físico: {v} %")
        m[ia[round(a, 4)]][io[round(o, 4)]] = min(100.0, max(0.0, v))
    if any(x is None for linha in m for x in linha):
        raise ValueError("grade com pontos faltando")
    grade = {"lat0": la[0], "lon0": lo[0], "dlat": round(dlat, 6), "dlon": round(dlon, 6), "nlat": len(la), "nlon": len(lo)}
    return grade, m


# ---------------------------------------------------------------- processamento
def resumo(m):
    vals = [v for l in m for v in l]
    return round(min(vals), 1), round(max(vals), 1)


def processar(data, destino):
    run = datetime(data.year, data.month, data.day, int(CICLO), tzinfo=timezone.utc)
    campos, arquivos, grade, inv = {}, [], None, []
    with tempfile.TemporaryDirectory() as tmp:
        for h in sorted(HORAS, reverse=True):        # o último horizonte primeiro: se não saiu, nem continua
            dados, linha = wrf_baixar(run, h)
            inv.append(f"f{h:03d}: {linha}")
            arquivos.append({"h": h, "bytes": len(dados), "sha256": hashlib.sha256(dados).hexdigest()})
            cam = os.path.join(tmp, f"f{h:03d}.grib2")
            with open(cam, "wb") as f:
                f.write(dados)
            g, m = ler_ur(cam, run, h)
            if grade is None:
                grade = g
            elif g != grade:
                raise ValueError(f"grade diferente em f{h:03d}: {g} x {grade}")
            mn, mx = resumo(m)
            if mx - mn < 1.0:
                raise ValueError(f"f{h:03d}: campo de UR praticamente constante ({mn}–{mx} %): dado suspeito")
            campos[h] = m
            time.sleep(PAUSA_S)
    dias = []
    for h in HORAS:
        v = run + timedelta(hours=h)
        ur = [[round(x, 1) for x in l] for l in campos[h]]
        mn, mx = resumo(ur)
        dias.append({"h": h, "valido_utc": v.strftime("%Y-%m-%dT%H:%MZ"),
                     "valido_local": v.astimezone(BRT).strftime("%Y-%m-%dT%H:%M-03:00"),
                     "min": mn, "max": mx, "ur": ur})
    n = len(HORAS)
    media = [[round(sum(campos[h][i][k] for h in HORAS) / n, 1) for k in range(grade["nlon"])] for i in range(grade["nlat"])]
    mn, mx = resumo(media)
    saida = {
        "versao": 1,
        "modelo": "WRF",
        "fonte": "CPTEC/INPE WRF 7 km (ams_07km) — dataserver, UR a 2 m por byte-range",
        "variavel": "Umidade relativa do ar a 2 m",
        "ciclo": CICLO,
        "data_ciclo": f"{data:%Y-%m-%d}",
        "rodada_utc": run.strftime("%Y-%m-%dT%H:%MZ"),
        "baixado_em": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "unidade": "%",
        "horario": "18 UTC (15h, hora local) de cada dia; UR mínima do período = média dos três dias",
        "grade": grade,
        "dias": dias,
        "media": {"de_local": dias[0]["valido_local"], "ate_local": dias[-1]["valido_local"], "min": mn, "max": mx, "ur": media},
        "arquivos": sorted(arquivos, key=lambda x: x["h"]),
        "inventario": sorted(inv),
    }
    os.makedirs(destino, exist_ok=True)
    final = os.path.join(destino, "wrf.json")
    tmpf = final + ".tmp"
    with open(tmpf, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmpf, final)
    log(f"  gravado {final} ({os.path.getsize(final) / 1024:.0f} KB); grade {grade['nlat']}x{grade['nlon']} "
        f"(passo {grade['dlat']}°); UR 18 UTC: " + ", ".join(f"+{d['h']} h {d['min']}–{d['max']} %" for d in dias)
        + f"; média {mn}–{mx} %")


def data_atual(destino):
    try:
        with open(os.path.join(destino, "wrf.json"), encoding="utf-8") as f:
            return json.load(f).get("data_ciclo")
    except (OSError, ValueError):
        return None


def gravar_status(destino, st):
    cam = os.path.join(destino, "status.json")
    try:
        with open(cam, encoding="utf-8") as f:
            antigo = json.load(f)
    except (OSError, ValueError):
        antigo = {}
    sem_hora = lambda s: {k: ({kk: vv for kk, vv in v.items() if kk != "em"} if isinstance(v, dict) else v) for k, v in s.items()}
    novo = {"wrf": st}
    if sem_hora(antigo) == sem_hora(novo):
        return
    os.makedirs(destino, exist_ok=True)
    with open(cam + ".tmp", "w", encoding="utf-8") as f:
        json.dump(novo, f, ensure_ascii=False, indent=1)
    os.replace(cam + ".tmp", cam)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    destino = sys.argv[1]
    agora = datetime.now(timezone.utc)
    atual = None if os.environ.get("REPROCESSAR") == "1" else data_atual(destino)
    st, erro = {"resultado": "sem rodada nova", "em": agora.strftime("%Y-%m-%dT%H:%MZ")}, False
    for d in (agora.date(), agora.date() - timedelta(days=1)):
        if atual and atual >= f"{d:%Y-%m-%d}":
            log(f"WRF: já temos a rodada de {atual}.")
            st = {"resultado": "ok", "rodada": atual, "em": st["em"]}
            break
        if agora < datetime(d.year, d.month, d.day, int(CICLO), tzinfo=timezone.utc) + timedelta(hours=WRF_ATRASO_H):
            continue
        log(f"WRF: tentando a rodada 00Z de {d:%Y-%m-%d}…")
        try:
            processar(d, destino)
            st = {"resultado": "ok", "rodada": f"{d:%Y-%m-%d}", "em": st["em"]}
            break
        except Indisponivel as e:
            log(f"  ainda não disponível ({e}).")
            st = {"resultado": "aguardando publicação", "rodada": f"{d:%Y-%m-%d}", "detalhe": str(e)[:300], "em": st["em"]}
        except Exception as e:   # mantém o JSON anterior
            erro = True
            log(f"  ERRO: {e}")
            st = {"resultado": "erro", "rodada": f"{d:%Y-%m-%d}", "detalhe": str(e)[:500], "em": st["em"]}
            break
    gravar_status(destino, st)
    return 1 if erro else 0


if __name__ == "__main__":
    sys.exit(main())
