const http = require('http');
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-sol';
const PUBLIC_DIR = path.join(__dirname, 'public');

const SYSTEM_INSTRUCTION = `Você é um especialista em engenharia de prompts para geração de vídeo no Google Flow / Omni.
Sua função é transformar um comando curto do usuário em um prompt extremamente detalhado, fisicamente coerente e pronto para copiar e colar.

SEMPRE organize o resultado em exatamente 7 áreas:
1. CENA
2. PERSONAGEM
3. AÇÃO
4. CONSISTÊNCIA DO PRODUTO
5. CÂMERA
6. ESTILO E FÍSICA
7. RESTRIÇÕES

REGRAS OBRIGATÓRIAS:
- O conteúdo das 7 áreas e o prompt final devem ser escritos em inglês.
- Interprete a intenção do usuário, mas não invente mudanças desnecessárias na cena.
- Quando houver imagem de referência, use-a para descrever e preservar ambiente, produto, posição, aparência e enquadramento relevantes.
- A seção ACTION deve ser a mais detalhada e deve decompor o movimento em ordem cronológica, sem pular transições.
- Para movimento humano, especifique orientação do corpo, posição dos pés, transferência de peso, flexão de joelhos/quadril, equilíbrio, tronco, braços, mãos e contato físico.
- Para interação com objetos, especifique qual mão se aproxima, onde ocorre o contato, como os dedos seguram, quando o objeto começa a se mover, trajetória, gravidade e quando é solto.
- Para calçar tênis, quando aplicável, descreva: aproximação, giro para o sofá, flexão de joelhos/quadril, contato com o assento, estabilização dos pés, inclinação do tronco, alcance das mãos, pegada no tênis, posicionamento da abertura, levantamento do pé, entrada dos dedos, deslizamento do pé, encaixe do calcanhar, ajuste do colar e retorno do pé ao chão; repetir para o outro pé somente depois de concluir o primeiro.
- Nunca use teletransporte de membros ou objetos entre posições. Cada ação deve transicionar suavemente para a próxima.
- Respeite anatomia humana, gravidade, inércia, peso, apoio e contato realista.
- Se o usuário pedir câmera parada, reforce static locked-off tripod camera, no pan, no tilt, no zoom, no dolly, no reframing, no shake.
- Se o usuário pedir aproximação física da câmera, diferencie dolly/push-in de zoom.
- Preserve produto: forma, cor, logo quando visível, materiais, textura, proporções e detalhes não devem mudar.
- Nas restrições, bloqueie somente erros relevantes, mas seja específico: duplicate people, extra limbs, extra fingers, floating objects, object clipping, foot clipping, product morphing, temporal jumps, sudden pose changes, unintended cuts, unwanted camera movement.
- Leve em conta duração, enquadramento, câmera, rosto, quantidade de pessoas e opções fornecidas pelo aplicativo.
- Se houver correções selecionadas pelo usuário, reforce explicitamente essas falhas na nova versão.
- Não inclua explicações fora dos campos solicitados.
- O final_prompt deve concatenar e harmonizar as 7 áreas em um único texto natural em inglês, pronto para o gerador de vídeo.
`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    scene: { type: 'string' },
    subject: { type: 'string' },
    action: { type: 'string' },
    product_consistency: { type: 'string' },
    camera: { type: 'string' },
    style_physics: { type: 'string' },
    constraints: { type: 'string' },
    final_prompt: { type: 'string' }
  },
  required: [
    'scene', 'subject', 'action', 'product_consistency',
    'camera', 'style_physics', 'constraints', 'final_prompt'
  ],
  additionalProperties: false
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJson(req, maxBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Arquivo ou requisição grande demais. Use uma imagem menor.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeSettings(body) {
  return {
    duration: String(body.duration || '8 segundos').slice(0, 80),
    cameraMode: String(body.cameraMode || 'Estática').slice(0, 100),
    framing: String(body.framing || 'Da cintura para baixo').slice(0, 100),
    outputLanguage: String(body.outputLanguage || 'Inglês').slice(0, 50),
    hideFace: Boolean(body.hideFace),
    onePerson: Boolean(body.onePerson),
    noZoom: Boolean(body.noZoom),
    noCuts: Boolean(body.noCuts),
    preserveProduct: Boolean(body.preserveProduct),
    maximumDetail: Boolean(body.maximumDetail),
    realisticPhysics: Boolean(body.realisticPhysics),
    corrections: Array.isArray(body.corrections) ? body.corrections.slice(0, 12).map(String) : []
  };
}

function buildUserText(body) {
  const prompt = String(body.prompt || '').trim().slice(0, 5000);
  const settings = sanitizeSettings(body);
  return `COMANDO DO USUÁRIO:\n${prompt}\n\nCONFIGURAÇÕES DO APLICATIVO:\n${JSON.stringify(settings, null, 2)}\n\n${body.hasImage ? 'Há uma imagem de referência anexada. Analise-a e preserve os elementos relevantes.' : 'Não há imagem de referência.'}`;
}

function extractOutputText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const parts = [];
  for (const item of payload.output || []) {
    if (!Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content && content.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

async function generateWithOpenAI(body) {
  const userContent = [{ type: 'input_text', text: buildUserText(body) }];
  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  if (imageDataUrl.startsWith('data:image/')) {
    userContent.push({ type: 'input_image', image_url: imageDataUrl, detail: 'high' });
  }

  const apiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: 'medium' },
      input: [
        { role: 'system', content: [{ type: 'input_text', text: SYSTEM_INSTRUCTION }] },
        { role: 'user', content: userContent }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'omni_prompt_7_steps',
          strict: true,
          schema: OUTPUT_SCHEMA
        }
      }
    })
  });

  const payload = await apiResponse.json().catch(() => ({}));
  if (!apiResponse.ok) {
    const message = payload?.error?.message || `OpenAI API retornou HTTP ${apiResponse.status}`;
    throw new Error(message);
  }

  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error('A OpenAI não retornou texto estruturado.');
  const parsed = JSON.parse(outputText);
  return { ...parsed, meta: { mode: 'openai', model: OPENAI_MODEL } };
}

function demoGenerate(body) {
  const prompt = String(body.prompt || '').trim() || 'A person performs the requested action.';
  const s = sanitizeSettings(body);
  const corrections = s.corrections.length ? ` Explicitly prevent: ${s.corrections.join(', ')}.` : '';
  const lower = prompt.toLowerCase();
  const shoeAction = /t[eê]nis|shoe|sneaker|cal[çc]a/.test(lower);
  const sofaAction = /sof[aá]|sofa|couch/.test(lower);

  const scene = sofaAction
    ? 'Preserve the reference environment. A realistic living-room setting contains a stable sofa and the referenced pair of sneakers positioned on the floor within natural reach of the seated subject. Keep furniture, floor, lighting, object placement and spatial relationships consistent throughout the shot.'
    : 'Preserve the reference environment, object placement, lighting and spatial relationships. Keep the scene stable and visually consistent for the entire shot.';

  const subject = `${s.onePerson ? 'Exactly one adult person appears in the entire scene.' : 'Use only the people explicitly required by the user.'} ${s.hideFace ? 'The face must remain completely outside the frame at all times.' : 'Keep the subject visually consistent throughout the shot.'} Clothing, body proportions and identity must not change between frames.`;

  let action;
  if (shoeAction && sofaAction) {
    action = 'The man approaches the sofa at a normal walking pace while maintaining balanced, anatomically correct steps. As he reaches the front of the sofa, he slows down, positions both feet securely on the floor, turns his hips and torso so the backs of his legs align with the seat, then bends both knees and hips progressively. He lowers his body under control until the back of his thighs and hips make real physical contact with the sofa cushion, transfers his body weight onto the seat, and stabilizes before beginning the next action. With both feet initially flat on the floor, he leans his torso forward from the hips without collapsing his posture. He reaches toward the first sneaker with his nearest hand, wraps his fingers naturally around the upper and heel area, and lifts it only after clear hand-to-object contact is established. He places the shoe opening directly in front of the corresponding foot, uses both hands to open the collar, slightly lifts that foot, aligns the toes with the opening, inserts the toes first, then slides the forefoot and midfoot inside in one continuous motion. He pushes the heel downward and backward until it seats inside the heel cup, using one hand to pull the rear collar around the heel rather than allowing the foot or shoe to intersect. He lowers the fully shod foot back to the floor and stabilizes it. Only after the first shoe is completely on does he repeat the same sequence for the second foot. Every transition must be visible, gradual and physically connected; no pose jumps or instant shoe placement.';
  } else {
    action = `Perform the user's requested action in this exact intent: “${prompt}”. Break the action into visible chronological micro-movements. Establish body balance before each transition, maintain natural joint articulation, preserve hand-to-object contact whenever an object moves, and show each intermediate position instead of jumping instantly from one pose to another.`;
  }

  const product = `${s.preserveProduct ? 'The referenced product must remain identical throughout the clip: preserve exact shape, proportions, color, materials, texture, sole, laces, logos and visible design details. Never redesign, recolor or morph it.' : 'Keep all important referenced objects visually consistent throughout the clip.'}`;
  const camera = `${s.cameraMode.toLowerCase().includes('est') ? 'Use a locked-off static tripod camera.' : `Use the requested camera behavior: ${s.cameraMode}.`} Framing: ${s.framing}. ${s.noZoom ? 'No optical zoom and no digital zoom.' : ''} ${s.noCuts ? 'Single continuous unbroken shot with no cuts or transitions.' : ''} Do not reframe unexpectedly.`;
  const style = `${s.realisticPhysics ? 'Photorealistic motion with realistic anatomy, gravity, balance, weight transfer, friction, inertia, cloth behavior, object weight and physical contact.' : 'Natural coherent motion and consistent lighting.'} Use smooth temporal continuity, believable acceleration and deceleration, and stable lighting/shadows.`;
  const constraints = `No duplicate people, no extra hands, no extra fingers, no extra limbs, no fused anatomy, no foot clipping, no object clipping, no floating objects, no teleportation, no morphing, no sudden pose changes, no product deformation, no temporal jumps${s.noCuts ? ', no cuts' : ''}${s.noZoom ? ', no zoom' : ''}${s.hideFace ? ', never reveal the face' : ''}.${corrections}`;
  const final_prompt = `SCENE: ${scene}\n\nSUBJECT: ${subject}\n\nACTION: ${action}\n\nPRODUCT CONSISTENCY: ${product}\n\nCAMERA: ${camera}\n\nSTYLE AND PHYSICS: ${style}\n\nCONSTRAINTS: ${constraints}`;

  return { scene, subject, action, product_consistency: product, camera, style_physics: style, constraints, final_prompt, meta: { mode: 'demo', model: null } };
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  })[ext] || 'application/octet-stream';
}

function serveStatic(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname); }
  catch { pathname = '/'; }
  if (pathname === '/') pathname = '/index.html';
  const normalized = path.normalize(pathname).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, normalized);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/status') {
    return sendJson(res, 200, {
      aiEnabled: Boolean(OPENAI_API_KEY),
      mode: OPENAI_API_KEY ? 'openai' : 'demo',
      model: OPENAI_API_KEY ? OPENAI_MODEL : null
    });
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    try {
      const body = await readJson(req);
      if (!String(body.prompt || '').trim()) return sendJson(res, 400, { error: 'Descreva o vídeo antes de gerar.' });
      const result = OPENAI_API_KEY ? await generateWithOpenAI(body) : demoGenerate(body);
      return sendJson(res, 200, result);
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, { error: error.message || 'Falha ao gerar prompt.' });
    }
  }

  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Gerador Omni: http://localhost:${PORT}`);
  console.log(OPENAI_API_KEY ? `OpenAI ativa (${OPENAI_MODEL})` : 'Modo demonstração: adicione OPENAI_API_KEY no .env para ativar a IA real.');
});
