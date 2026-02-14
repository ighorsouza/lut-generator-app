# LUT Generator App

Aplicação web para gerar LUTs personalizadas no formato `.CUBE` a partir de uma foto enviada pelo usuário.

## Funcionalidades

- Upload de foto do usuário.
- Análise automática de luminância, média de canais RGB e contraste.
- Geração de LUT 3D personalizada (`LUT_3D_SIZE 33`).
- Retorno do conteúdo `.CUBE` via API.
- Download da LUT no frontend com um clique.

## Como executar

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Abra: `http://127.0.0.1:8000`

## API

### `POST /api/generate-lut`

Envie `multipart/form-data` com o campo:

- `file`: imagem (`image/*`)

Resposta JSON:

- `filename`: nome sugerido para download (`.cube`)
- `analysis`: métricas da imagem
- `cube`: conteúdo completo da LUT `.CUBE`
