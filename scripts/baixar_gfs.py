#!/usr/bin/env python3
"""Baixa a chuva prevista do modelo GFS (dado bruto, NOAA/NCEP) para a ferramenta
Reservatórios e Tendência e grava, por ciclo (00Z e 06Z), um JSON pequeno com os
acumulados em mm sobre Minas Gerais.

De onde vem
  NOMADS/NCEP, filtro oficial de GRIB (filter_gfs_0p25.pl): pedimos só a variável
  APCP (chuva acumulada) na superfície e só um recorte em volta de MG. Cada arquivo
  tem poucos KB. São 56 arquivos por ciclo (de 6 em 6 h até 336 h = 14 dias).

O que sai  <destino>/<ciclo>/gfs.json
  grade 0,25° (lon/lat explícitos) e, para cada produto, a matriz de chuva em mm
  (1 casa decimal):
    24h   = 0–24 h      day3  = 0–72 h      day5 = 0–120 h
    week1 = 0–168 h     week2 = 168–336 h   (mesmos períodos das imagens do CPC)
  + origem, data do ciclo, hora do download e sha256 de cada arquivo baixado.

Cuidados
  - Só acessa https://nomads.ncep.noaa.gov (o endereço é fixo; redirecionamento
    para outro lugar é recusado). Sem senha, sem chave.
  - Cada arquivo precisa ser um GRIB2 completo ("GRIB" ... "7777"), até 2 MB.
  - A leitura do GRIB é feita pelo ecCodes (ECMWF), instalado pelo apt do Ubuntu.
  - Confere: variável e tipo (chuva acumulada), grade igual em todos os arquivos,
    valores finitos, sem negativos, limites físicos, e que os acumulados maiores
    nunca são menores que os menores (24 h <= 3 dias <= 5 dias <= Week 1).
  - Pausa entre pedidos (o NOMADS bloqueia quem passa de ~120 pedidos/min).
  - Se a rodada nova ainda não saiu ou algo falhar, o JSON anterior fica como
    está (a página mostra a idade do dado). Só reescreve quando há ciclo novo.

Uso: python3 -I scripts/baixar_gfs.py reservatorios/gfs
     (REPROCESSAR=1 refaz a rodada mais recente mesmo que já exista)
"""
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

FILTRO = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
HOST = "nomads.ncep.noaa.gov"
# recorte: 52,5°O a 38,5°O e 13°S a 24,5°S (MG inteira com folga; longitudes 0–360 no filtro)
REGIAO = {"leftlon": "307.5", "rightlon": "321.5", "toplat": "-13", "bottomlat": "-24.5"}
CICLOS = ["00", "06"]
PASSO_H = 6
FIM_H = 336
PRODUTOS = {"24h": (0, 24), "day3": (0, 72), "day5": (0, 120), "week1": (0, 168), "week2": (168, 336)}
ORDEM_CRESCENTE = ["24h", "day3", "day5", "week1"]   # cada um contém o anterior
TAM_MAX = 2 * 1024 * 1024
PAUSA_S = 1.4
UA = "SIMGE-IGAM ferramentas-meteorologia (GitHub Actions; dados publicos GFS/NOMADS)"
ATRASO_MIN_H = 4.5      # a rodada costuma estar completa até f336 ~4,5 h depois do ciclo
LIMITE_6H_MM = 600.0    # chuva em 6 h acima disso é erro de leitura, não chuva
LIMITE_TOTAL_MM = 3000.0


class Indisponivel(Exception):
    """O arquivo da rodada ainda não está no NOMADS."""


def log(*a):
    print(*a, flush=True)


def url_arquivo(data, ciclo, h):
    q = {
        "dir": f"/gfs.{data:%Y%m%d}/{ciclo}/atmos",
        "file": f"gfs.t{ciclo}z.pgrb2.0p25.f{h:03d}",
        "var_APCP": "on",
        "lev_surface": "on",
        "subregion": "",
        **REGIAO,
    }
    return FILTRO + "?" + urllib.parse.urlencode(q)


def baixar(url):
    if urllib.parse.urlparse(url).netloc != HOST or not url.startswith("https://"):
        raise ValueError(f"endereço recusado: {url}")
    ultimo = None
    for tentativa in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                final = r.geturl()
                if urllib.parse.urlparse(final).netloc != HOST:
                    raise ValueError(f"redirecionamento para fora do NOMADS recusado: {final}")
                dados = r.read(TAM_MAX + 1)
            if len(dados) > TAM_MAX:
                raise ValueError("arquivo maior que o limite")
            if dados[:4] != b"GRIB":
                txt = dados[:400].decode("latin-1", "replace").lower()
                if "not present" in txt or "not available" in txt or "no such" in txt or "does not exist" in txt:
                    raise Indisponivel(txt.strip()[:160])
                raise ValueError("resposta não é GRIB: " + txt.strip()[:160])
            if dados[-4:] != b"7777":
                raise ValueError("GRIB incompleto (sem o fim '7777')")
            return dados
        except Indisponivel:
            raise
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise Indisponivel("HTTP 404")
            ultimo = e
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError) as e:
            ultimo = e
            if isinstance(e, ValueError) and "recusado" in str(e):
                raise
        time.sleep(5 + 10 * tentativa)
    raise RuntimeError(f"falha ao baixar depois de 3 tentativas: {ultimo}")


def executar(args):
    r = subprocess.run(args, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"{args[0]} falhou: {r.stderr.strip()[:300]}")
    return r.stdout


def ler_grib(caminho):
    """Lista de mensagens: (inicio_h, fim_h, lats, lons, valores) via ecCodes."""
    chaves = "count,discipline,parameterCategory,parameterNumber,typeOfStatisticalProcessing,stepUnits,startStep,endStep,Ni,Nj"
    info = json.loads(executar(["grib_ls", "-j", "-p", chaves, caminho]))
    msgs = info.get("messages", []) if isinstance(info, dict) else info
    saida = []
    for m in msgs:
        if isinstance(m, list):   # formatos antigos do grib_ls -j
            m = {d["key"]: d["value"] for d in m}
        # APCP na tabela oficial da OMM (GRIB2): disciplina 0, categoria 1, parâmetro 8; processamento 1 = acumulado
        if (str(m.get("discipline")), str(m.get("parameterCategory")), str(m.get("parameterNumber")),
                str(m.get("typeOfStatisticalProcessing"))) != ("0", "1", "8", "1"):
            continue
        ini, fim = int(m["startStep"]), int(m["endStep"])
        if str(m.get("stepUnits", "h")) not in ("h", "1"):
            raise ValueError(f"unidade de tempo inesperada: {m.get('stepUnits')}")
        txt = executar(["grib_get_data", "-w", f"count={m['count']}", "-F", "%.4f", caminho])
        lats, lons, vals = [], [], []
        for linha in txt.splitlines():
            p = linha.split()
            if len(p) != 3 or p[0].lower().startswith("lat"):
                continue
            la, lo, v = float(p[0]), float(p[1]), float(p[2])
            if lo > 180:
                lo -= 360
            lats.append(round(la, 4)); lons.append(round(lo, 4)); vals.append(v)
        if len(vals) != int(m["Ni"]) * int(m["Nj"]):
            raise ValueError(f"número de pontos inesperado ({len(vals)} em vez de {m['Ni']}x{m['Nj']})")
        saida.append((ini, fim, lats, lons, vals))
    if not saida:
        raise ValueError("nenhuma mensagem de chuva acumulada (APCP) no arquivo")
    return saida


def montar_grade(lats, lons):
    la = sorted(set(lats), reverse=True)          # norte -> sul
    lo = sorted(set(lons))                         # oeste -> leste
    if len(la) * len(lo) != len(lats):
        raise ValueError("grade irregular")
    for seq in (la, lo):
        d = [round(abs(seq[i + 1] - seq[i]), 4) for i in range(len(seq) - 1)]
        if any(abs(x - 0.25) > 1e-3 for x in d):
            raise ValueError("espaçamento da grade diferente de 0,25°")
    return la, lo


def para_matriz(lats, lons, vals, la, lo):
    ia = {v: i for i, v in enumerate(la)}
    io = {v: i for i, v in enumerate(lo)}
    m = [[None] * len(lo) for _ in la]
    for a, o, v in zip(lats, lons, vals):
        if not math.isfinite(v):
            raise ValueError("valor não numérico na grade")
        if v < -0.05 or v > LIMITE_6H_MM * 4:
            raise ValueError(f"valor fora do limite físico: {v}")
        m[ia[a]][io[o]] = max(0.0, v)
    if any(x is None for linha in m for x in linha):
        raise ValueError("grade com pontos faltando")
    return m


def somar(a, b):
    return [[x + y for x, y in zip(la, lb)] for la, lb in zip(a, b)]


def subtrair(a, b):
    return [[max(0.0, x - y) for x, y in zip(la, lb)] for la, lb in zip(a, b)]


def acumulado(intervalos, a, b, zeros):
    """Chuva de a até b (h) com os intervalos disponíveis: soma de baldes seguidos
    (ex.: 0-6, 6-12, ...) ou diferença entre dois acumulados desde 0 h."""
    alcance = {a: zeros}
    for t in sorted({s for s, _ in intervalos} | {a}):
        if t not in alcance or t >= b:
            continue
        for (s, e), campo in sorted(intervalos.items()):
            if s == t and e <= b and e not in alcance:
                alcance[e] = somar(alcance[t], campo)
    if b in alcance:
        return alcance[b]
    if (0, b) in intervalos and (a == 0 or (0, a) in intervalos):
        return intervalos[(0, b)] if a == 0 else subtrair(intervalos[(0, b)], intervalos[(0, a)])
    raise ValueError(f"não foi possível montar o acumulado {a}-{b} h com os arquivos baixados")


def processar(data, ciclo, destino):
    intervalos, arquivos, grade = {}, [], None
    with tempfile.TemporaryDirectory() as tmp:
        for h in [FIM_H] + list(range(PASSO_H, FIM_H, PASSO_H)):
            dados = baixar(url_arquivo(data, ciclo, h))      # f336 primeiro: se não saiu, nem começa
            arquivos.append({"h": h, "bytes": len(dados), "sha256": hashlib.sha256(dados).hexdigest()})
            caminho = os.path.join(tmp, f"f{h:03d}.grib2")
            with open(caminho, "wb") as f:
                f.write(dados)
            for ini, fim, lats, lons, vals in ler_grib(caminho):
                g = montar_grade(lats, lons)
                if grade is None:
                    grade = g
                elif g != grade:
                    raise ValueError(f"grade diferente no arquivo f{h:03d}")
                intervalos[(ini, fim)] = para_matriz(lats, lons, vals, *grade)
            time.sleep(PAUSA_S)
    la, lo = grade
    zeros = [[0.0] * len(lo) for _ in la]
    # baldes de 6 h: conferência física
    for (s, e), campo in intervalos.items():
        if e - s <= 6 and max(max(l) for l in campo) > LIMITE_6H_MM:
            raise ValueError(f"chuva acima de {LIMITE_6H_MM} mm em 6 h ({s}-{e} h): leitura suspeita")
    produtos = {}
    for k, (a, b) in PRODUTOS.items():
        m = acumulado(intervalos, a, b, zeros)
        mx = max(max(l) for l in m)
        if mx > LIMITE_TOTAL_MM:
            raise ValueError(f"{k}: máximo {mx:.1f} mm acima do limite físico")
        produtos[k] = {"de_h": a, "ate_h": b, "max_mm": round(mx, 1),
                       "mm": [[round(x, 1) for x in linha] for linha in m]}
    # conferências cruzadas
    for p, q in zip(ORDEM_CRESCENTE, ORDEM_CRESCENTE[1:]):
        mp, mq = produtos[p]["mm"], produtos[q]["mm"]
        if any(x > y + 0.3 for lx, ly in zip(mp, mq) for x, y in zip(lx, ly)):
            raise ValueError(f"{p} maior que {q} em algum ponto: dado inconsistente")
    if (0, 336) in intervalos:   # se o arquivo trouxer o total desde 0 h, confere com a soma dos baldes
        soma = somar(acumulado(intervalos, 0, 168, zeros), acumulado(intervalos, 168, 336, zeros))
        dif = max(abs(x - y) for lx, ly in zip(soma, intervalos[(0, 336)]) for x, y in zip(lx, ly))
        if dif > 1.0:
            raise ValueError(f"soma dos baldes difere do total 0-336 h em {dif:.1f} mm")
    rodada = datetime(data.year, data.month, data.day, int(ciclo), tzinfo=timezone.utc)
    saida = {
        "versao": 1,
        "fonte": "NOAA/NCEP GFS 0,25° — NOMADS (filter_gfs_0p25), variável APCP (chuva acumulada)",
        "modelo": "GFS",
        "ciclo": ciclo,
        "data_ciclo": f"{data:%Y-%m-%d}",
        "rodada_utc": rodada.strftime("%Y-%m-%dT%H:%MZ"),
        "baixado_em": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "unidade": "mm",
        "grade": {"resolucao_graus": 0.25, "lat": la, "lon": lo},
        "produtos": produtos,
        "arquivos": sorted(arquivos, key=lambda x: x["h"]),
        "intervalos_h": sorted([list(k) for k in intervalos]),   # acumulados encontrados nos arquivos (transparência)
    }
    pasta = os.path.join(destino, ciclo)
    os.makedirs(pasta, exist_ok=True)
    final = os.path.join(pasta, "gfs.json")
    tmpf = final + ".tmp"
    with open(tmpf, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmpf, final)   # troca de uma vez: a página nunca vê um arquivo pela metade
    log(f"  intervalos de chuva nos arquivos: {len(intervalos)} (ex.: {sorted(intervalos)[:4]} … {sorted(intervalos)[-2:]})")
    log(f"  gravado {final} ({os.path.getsize(final)/1024:.0f} KB); máximos: " +
        ", ".join(f"{k} {v['max_mm']} mm" for k, v in produtos.items()))


def data_atual(destino, ciclo):
    try:
        with open(os.path.join(destino, ciclo, "gfs.json"), encoding="utf-8") as f:
            return json.load(f).get("data_ciclo")
    except (OSError, ValueError):
        return None


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    destino = sys.argv[1]
    agora = datetime.now(timezone.utc)
    erros = 0
    for ciclo in CICLOS:
        atual = None if os.environ.get("REPROCESSAR") == "1" else data_atual(destino, ciclo)
        for d in (agora.date(), agora.date() - timedelta(days=1)):
            if atual and atual >= f"{d:%Y-%m-%d}":
                log(f"{ciclo}Z: já temos a rodada de {atual}.")
                break
            inicio = datetime(d.year, d.month, d.day, int(ciclo), tzinfo=timezone.utc)
            if agora < inicio + timedelta(hours=ATRASO_MIN_H):
                continue
            log(f"{ciclo}Z: tentando a rodada de {d:%Y-%m-%d}…")
            try:
                processar(d, ciclo, destino)
                break
            except Indisponivel as e:
                log(f"  ainda não disponível ({e}).")
            except Exception as e:   # mantém o JSON anterior
                erros += 1
                log(f"  ERRO: {e}")
                break
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
