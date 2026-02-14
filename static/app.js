const form = document.getElementById('upload-form');
const fileInput = document.getElementById('photo');
const statusEl = document.getElementById('status');
const analysisEl = document.getElementById('analysis');
const downloadEl = document.getElementById('download');

const toPercent = (value) => `${(value * 100).toFixed(1)}%`;

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!fileInput.files?.length) {
    statusEl.textContent = 'Selecione uma imagem.';
    return;
  }

  statusEl.textContent = 'Analisando imagem e gerando LUT...';
  analysisEl.classList.add('hidden');
  downloadEl.classList.add('hidden');

  const data = new FormData();
  data.append('file', fileInput.files[0]);

  try {
    const response = await fetch('/api/generate-lut', {
      method: 'POST',
      body: data,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail ?? 'Falha ao gerar LUT.');
    }

    const { analysis, cube, filename } = payload;

    analysisEl.innerHTML = `
      <h3>Resumo da análise</h3>
      <ul>
        <li>Luminância média: <strong>${toPercent(analysis.luminance)}</strong></li>
        <li>Canal R médio: <strong>${toPercent(analysis.mean_r)}</strong></li>
        <li>Canal G médio: <strong>${toPercent(analysis.mean_g)}</strong></li>
        <li>Canal B médio: <strong>${toPercent(analysis.mean_b)}</strong></li>
      </ul>
    `;

    const blob = new Blob([cube], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    downloadEl.href = url;
    downloadEl.download = filename;
    downloadEl.classList.remove('hidden');
    analysisEl.classList.remove('hidden');
    statusEl.textContent = 'LUT pronta! Faça o download abaixo.';
  } catch (error) {
    statusEl.textContent = error.message;
  }
});
