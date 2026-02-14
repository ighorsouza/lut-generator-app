from __future__ import annotations

from io import BytesIO
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="LUT Generator App")


def _analyze_image(image_bytes: bytes) -> dict[str, float]:
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Arquivo enviado não é uma imagem válida.") from exc

    pixels = np.asarray(image, dtype=np.float32) / 255.0
    flattened = pixels.reshape(-1, 3)

    mean_rgb = flattened.mean(axis=0)
    std_rgb = flattened.std(axis=0)
    luminance = (0.2126 * flattened[:, 0] + 0.7152 * flattened[:, 1] + 0.0722 * flattened[:, 2]).mean()

    return {
        "mean_r": float(mean_rgb[0]),
        "mean_g": float(mean_rgb[1]),
        "mean_b": float(mean_rgb[2]),
        "std_r": float(std_rgb[0]),
        "std_g": float(std_rgb[1]),
        "std_b": float(std_rgb[2]),
        "luminance": float(luminance),
    }


def _build_lut_cube(analysis: dict[str, float], size: int = 33) -> str:
    # Ganho para corrigir exposição em direção ao meio-termo.
    luminance = analysis["luminance"]
    exposure_gain = np.clip(0.5 / max(luminance, 1e-3), 0.75, 1.35)

    # Balanceamento de cor com base no RGB médio.
    mean = np.array([analysis["mean_r"], analysis["mean_g"], analysis["mean_b"]], dtype=np.float32)
    balance = np.clip(mean.mean() / np.maximum(mean, 1e-3), 0.85, 1.15)

    # Ajuste de contraste via curva gamma (mais contraste => gamma menor).
    contrast = float(np.mean([analysis["std_r"], analysis["std_g"], analysis["std_b"]]))
    gamma = float(np.clip(1.05 - (contrast - 0.18), 0.82, 1.15))

    lines = [
        'TITLE "PersonalizedLUT"',
        "DOMAIN_MIN 0.0 0.0 0.0",
        "DOMAIN_MAX 1.0 1.0 1.0",
        f"LUT_3D_SIZE {size}",
    ]

    values = np.linspace(0.0, 1.0, size, dtype=np.float32)
    for blue in values:
        for green in values:
            for red in values:
                rgb = np.array([red, green, blue], dtype=np.float32)
                corrected = np.power(np.clip(rgb * exposure_gain, 0.0, 1.0), gamma)
                corrected *= balance
                corrected = np.clip(corrected, 0.0, 1.0)
                lines.append(f"{corrected[0]:.6f} {corrected[1]:.6f} {corrected[2]:.6f}")

    return "\n".join(lines) + "\n"


@app.post("/api/generate-lut")
async def generate_lut(file: UploadFile = File(...)) -> dict[str, object]:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Envie um arquivo de imagem.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    analysis = _analyze_image(image_bytes)
    cube = _build_lut_cube(analysis)

    return {
        "filename": "lut_personalizada.cube",
        "analysis": analysis,
        "cube": cube,
    }


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
