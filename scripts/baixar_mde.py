#!/usr/bin/env python3
"""
Modelo digital de elevação (MDE) para a ferramenta Mapas Climáticos — 13/11/2026 (Patrick/Claude), SIMGE/IGAM.

Roda no GitHub Actions (.github/workflows/dados-mde.yml), uma vez (o relevo não muda). Fonte pública e aberta:
Copernicus DEM GLO-90 (ESA/Copernicus, 90 m), bucket público da AWS "copernicus-dem-90m" (sem login).

Gera duas grades de ALTITUDE MÉDIA da célula (média dos pixels de 90 m que caem na célula — recomendação do
meteorologista: altitude média da célula, não o pixel do centro):
  mapas-climaticos/mde/mde_mg.bin    grade do mapa (a mesma do nucleo.js: centro -51,06/-14,22, 0,01°, 1123 x 873)
  mapas-climaticos/mde/mde_ext.bin   região das estações (centro -58,00/-8,50, 0,02°, 1051 x 826) — altitude das estações
  mapas-climaticos/mde/mde.json      metadados (grades, fonte, blocos usados, estatísticas, SHA-256 dos .bin)
Formato .bin: Int16 little-endian, linhas do norte para o sul; -32768 = sem dado (mar / fora da cobertura).

Conferências antes de gravar (se falhar, não grava): número mínimo de blocos, cobertura de MG ≥ 99 %, altitudes de
MG dentro de 0–3.000 m, pontos de controle conhecidos (Belo Horizonte ~850 m, Pico da Bandeira > 2.200 m na célula
de 2 km mais alta da Serra do Caparaó, Montes Claros ~650 m).

Uso: python3 scripts/baixar_mde.py mapas-climaticos/mde
"""
import hashlib
import io
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import rasterio

BUCKET = "https://copernicus-dem-90m.s3.amazonaws.com"
UA = "SIMGE-IGAM-ferramentas-meteorologia/1.0 (painel de testes)"
GRADES = {
    "mg": dict(lon0=-51.06, lat0=-14.22, d=0.01, nx=1123, ny=873),
    "ext": dict(lon0=-58.00, lat0=-8.50, d=0.02, nx=1051, ny=826),
}
SEM = -32768


def baixar(url, tent=4):
    ult = None
    for t in range(tent):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=180) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if getattr(e, "code", None) == 404:
                return None
            ult = e
            time.sleep(4 * (t + 1))
    raise RuntimeError(f"falha ao baixar {url}: {ult}")


def caixa(G):
    return (G["lon0"] - G["d"] / 2, G["lon0"] + (G["nx"] - 0.5) * G["d"], G["lat0"] - (G["ny"] - 0.5) * G["d"], G["lat0"] + G["d"] / 2)


def main():
    saida = Path(sys.argv[1] if len(sys.argv) > 1 else "mapas-climaticos/mde")
    saida.mkdir(parents=True, exist_ok=True)
    x0 = min(caixa(G)[0] for G in GRADES.values()); x1 = max(caixa(G)[1] for G in GRADES.values())
    y0 = min(caixa(G)[2] for G in GRADES.values()); y1 = max(caixa(G)[3] for G in GRADES.values())
    print(f"Área: lon {x0:.2f}..{x1:.2f}, lat {y0:.2f}..{y1:.2f}", flush=True)

    lista = baixar(BUCKET + "/tileList.txt")
    if not lista:
        raise SystemExit("tileList.txt não encontrado no bucket")
    nomes = [l.strip() for l in lista.decode().splitlines() if l.strip()]
    rx = re.compile(r"Copernicus_DSM_COG_30_([NS])(\d\d)_00_([EW])(\d\d\d)_00_DEM")
    escolhidos = []
    for n in nomes:
        m = rx.fullmatch(n)
        if not m:
            continue
        la = int(m.group(2)) * (1 if m.group(1) == "N" else -1)
        lo = int(m.group(4)) * (1 if m.group(3) == "E" else -1)
        # o nome indica um canto do bloco de 1°; com folga de 1° nos dois sentidos, a posição exata vem do próprio arquivo
        if x0 - 1 <= lo <= x1 + 1 and y0 - 1 <= la <= y1 + 1:
            escolhidos.append(n)
    print(f"{len(nomes)} blocos no bucket; {len(escolhidos)} na área (com folga)", flush=True)
    if len(escolhidos) < 150:
        raise SystemExit(f"poucos blocos na área ({len(escolhidos)}): conferir a lista do bucket")

    soma = {k: np.zeros(G["nx"] * G["ny"]) for k, G in GRADES.items()}
    cont = {k: np.zeros(G["nx"] * G["ny"]) for k, G in GRADES.items()}
    usados = 0
    for i, n in enumerate(sorted(escolhidos)):
        url = f"{BUCKET}/{n}/{n}.tif"
        b = baixar(url)
        if b is None:
            continue
        with rasterio.MemoryFile(io.BytesIO(b)) as mf, mf.open() as ds:
            a = ds.read(1).astype(np.float64)
            nod = ds.nodata
            T = ds.transform
            h, w = a.shape
            cols = T.c + T.a * (np.arange(w) + 0.5)   # centro dos pixels
            rows = T.f + T.e * (np.arange(h) + 0.5)
        ok = np.isfinite(a)
        if nod is not None:
            ok &= a != nod
        ok &= (a > -500) & (a < 9000)
        if not ok.any():
            continue
        for k, G in GRADES.items():
            ix = np.floor((cols - (G["lon0"] - G["d"] / 2)) / G["d"]).astype(int)
            iy = np.floor(((G["lat0"] + G["d"] / 2) - rows) / G["d"]).astype(int)
            vx = (ix >= 0) & (ix < G["nx"]); vy = (iy >= 0) & (iy < G["ny"])
            if not vx.any() or not vy.any():
                continue
            IY, IX = np.meshgrid(iy, ix, indexing="ij")
            sel = ok & vy[:, None] & vx[None, :]
            if not sel.any():
                continue
            lin = (IY[sel] * G["nx"] + IX[sel])
            soma[k] += np.bincount(lin, weights=a[sel], minlength=G["nx"] * G["ny"])
            cont[k] += np.bincount(lin, minlength=G["nx"] * G["ny"])
        usados += 1
        if i % 25 == 0:
            print(f"  {i + 1}/{len(escolhidos)} blocos", flush=True)
    print(f"{usados} blocos lidos", flush=True)

    meta = {"versao": 1, "fonte": "Copernicus DEM GLO-90 (ESA/Copernicus; AWS Open Data, bucket copernicus-dem-90m)",
            "metodo": "altitude média dos pixels de 90 m dentro de cada célula", "sem_dado": SEM, "formato": "Int16 LE, linhas do norte para o sul",
            "blocos": usados, "gerado_em": time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()), "grades": {}}
    grades = {}
    for k, G in GRADES.items():
        c = cont[k]
        z = np.where(c > 0, soma[k] / np.maximum(c, 1), np.nan).reshape(G["ny"], G["nx"])
        grades[k] = z
        meta["grades"][k] = dict(G, arquivo=f"mde_{k}.bin", cobertura=float(np.isfinite(z).mean()),
                                 min=float(np.nanmin(z)), max=float(np.nanmax(z)), pixels_por_celula=float(np.median(c[c > 0])))

    # ---- conferências ----
    def alt(k, lon, lat):
        G = GRADES[k]; i = int(round((lon - G["lon0"]) / G["d"])); j = int(round((G["lat0"] - lat) / G["d"]))
        return grades[k][j, i]
    z = grades["mg"]
    erros = []
    if meta["grades"]["mg"]["cobertura"] < 0.99:
        erros.append(f"cobertura da grade de MG {meta['grades']['mg']['cobertura']:.3f}")
    if not (0 <= np.nanmin(z) and np.nanmax(z) < 3000):
        erros.append(f"altitudes de MG fora de 0–3000 m ({np.nanmin(z):.0f}–{np.nanmax(z):.0f})")
    bh = alt("mg", -43.94, -19.92); mc = alt("mg", -43.86, -16.73)
    capa = np.nanmax(z[int(round((-14.22 + 20.38) / 0.01)) - 5:int(round((-14.22 + 20.38) / 0.01)) + 6, int(round((-41.80 + 51.06) / 0.01)) - 5:int(round((-41.80 + 51.06) / 0.01)) + 6])
    controle = {"Belo Horizonte (centro)": round(float(bh)), "Montes Claros": round(float(mc)), "Caparaó (maior célula perto do Pico da Bandeira)": round(float(capa))}
    meta["controle"] = controle
    print("Pontos de controle:", controle, flush=True)
    if not (650 <= bh <= 1100): erros.append(f"BH com {bh:.0f} m")
    if not (500 <= mc <= 800): erros.append(f"Montes Claros com {mc:.0f} m")
    if not (capa > 2000): erros.append(f"Caparaó com {capa:.0f} m")
    if erros:
        raise SystemExit("conferência falhou, nada gravado: " + "; ".join(erros))

    for k, G in GRADES.items():
        a = np.where(np.isfinite(grades[k]), np.round(grades[k]), SEM).astype("<i2")
        b = a.tobytes()
        (saida / f"mde_{k}.bin").write_bytes(b)
        meta["grades"][k]["sha256"] = hashlib.sha256(b).hexdigest()
        meta["grades"][k]["bytes"] = len(b)
    (saida / "mde.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Gravado:", json.dumps(meta["grades"], ensure_ascii=False)[:800], flush=True)


if __name__ == "__main__":
    main()
