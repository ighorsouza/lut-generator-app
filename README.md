# Gerador de Prompt Omni — 7 etapas

Protótipo funcional de um gerador de prompts detalhados para vídeos no Google Flow / Omni.

O app transforma uma instrução curta, por exemplo:

> Homem chega até o sofá que tem um par de tênis no chão, senta e calça o tênis.

em um prompt completo dividido em:

1. Cena
2. Personagem
3. Ação
4. Consistência do produto
5. Câmera
6. Estilo e física
7. Restrições

A seção **Ação** força detalhamento de movimentos intermediários, postura corporal, transferência de peso, mãos, pés, contato com objetos e sequência temporal para reduzir movimentos estranhos.

## Teste rápido — sem API

O projeto funciona em **modo demonstração** sem nenhuma chave. Nesse modo você já consegue testar a interface, opções, correções, histórico e geração local para cenas comuns.

Requer Node.js 18 ou superior.

```bash
git clone https://github.com/ighorsouza/lut-generator-app.git
cd lut-generator-app
git switch omni-prompt-generator
npm start
```

Abra no navegador:

```text
http://localhost:3000
```

## Ativar a OpenAI

1. Copie `.env.example` para `.env`.
2. Coloque sua chave em `OPENAI_API_KEY`.
3. Reinicie o servidor.

Exemplo:

```env
OPENAI_API_KEY=coloque_sua_chave_aqui
OPENAI_MODEL=gpt-5.6-sol
PORT=3000
```

A chave fica somente no servidor e **não é enviada ao navegador**.

O modelo padrão é `gpt-5.6-sol`. Você pode trocar `OPENAI_MODEL` por outro modelo compatível caso queira controlar custo/latência.

## Imagem de referência

Ao adicionar uma imagem, a versão com OpenAI envia texto + imagem na mesma solicitação. A IA usa a referência visual para ajudar a preservar produto, ambiente e composição.

No modo demonstração, a imagem aparece na interface, mas não é analisada por IA.

## Correção de erros

Depois de gerar, marque falhas como:

- Pessoa duplicada
- Mão estranha
- Objeto flutuando
- Câmera mexeu
- Produto deformou
- Pé atravessou o tênis
- Movimento rápido demais
- Apareceu o rosto
- Ação pulou etapas

Depois clique em **Gerar novamente com correções**.

## Estrutura

```text
.
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── public/
    └── index.html
```

O servidor usa apenas módulos nativos do Node.js; não há dependências npm obrigatórias.
