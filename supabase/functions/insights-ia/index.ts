// Gera a análise em texto da aba Insights a partir do resumo agregado que o
// app manda (ver src/lib/aiSummary.js).
//
// A chave do Gemini mora aqui, no ambiente da função, e nunca no bundle do
// front-end: qualquer VITE_* vira texto visível no site publicado. Por isso a
// chamada ao Gemini passa por esta função em vez de sair direto do navegador.
//
// Diferente da send-push (que é webhook e se autentica por segredo
// compartilhado), esta função é chamada por uma pessoa logada — o Supabase já
// valida o JWT da sessão antes de executar, então não há checagem manual aqui.

// Versão fixa de propósito: os apelidos "-latest" trocam de modelo sozinhos, e
// o prompt daqui foi ajustado em cima do comportamento deste. Os modelos 2.5
// saíram do ar pra chaves novas em 2026 — se este também sair um dia, o erro
// vem como 404 no log da função.
//
// Escolhido medindo os três candidatos com o mesmo resumo:
//   3.6-flash        17s  — texto bom, lento demais pra uma tela
//   3.5-flash-lite  2,7s  — rápido, mas ignora regras do prompt e exagera no
//                           tom ("queda livre" pra um mês que só começou)
//   3.5-flash       3,5s  — o texto mais preciso dos três, e rápido
const GEMINI_MODEL = 'gemini-3.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Abas do app pra onde uma ação sugerida pode levar. Precisa bater com os ids
// em TABS (src/App.jsx).
const DESTINOS = ['contas', 'cartoes', 'lancamentos', 'caixa', 'porquinhos', 'simulador']

// Forçar JSON com schema evita o passo frágil de tentar extrair texto de uma
// resposta em prosa livre — o modelo devolve exatamente esses campos ou a
// requisição falha, e a tela nunca recebe algo meio montado.
const responseSchema = {
  type: 'OBJECT',
  properties: {
    titulo: { type: 'STRING' },
    paragrafos: { type: 'ARRAY', items: { type: 'STRING' } },
    acoes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          emoji: { type: 'STRING' },
          texto: { type: 'STRING' },
          impacto: { type: 'STRING' },
          // Enum fechado em vez de texto livre: é o que deixa o botão levar
          // pra algum lugar de verdade. Um destino inventado viraria clique
          // morto, e adivinhar a aba a partir da frase erraria cedo ou tarde.
          destino: { type: 'STRING', enum: DESTINOS },
        },
        required: ['emoji', 'texto', 'impacto', 'destino'],
      },
    },
  },
  required: ['titulo', 'paragrafos', 'acoes'],
}

function buildPrompt(summary: unknown) {
  return `Você é o Finny, o assistente financeiro do app FinPilot. Escreve em
português do Brasil para a própria pessoa dona dessas finanças.

Abaixo está um resumo agregado das finanças dela. Todos os valores estão em
reais (BRL). As chaves "meses" e "porMes" usam o formato AAAA-MM, e o primeiro
mês da lista é o mês atual — que ainda está em andamento (estamos no dia
${(summary as { diaDoMes?: number }).diaDoMes ?? '?'}).

${JSON.stringify(summary, null, 2)}

Escreva uma análise seguindo estas regras:

SOBRE OS NÚMEROS
- Use apenas números que estão no resumo, ou contas simples feitas a partir
  deles (diferenças, somas, percentuais). Nunca invente um valor.
- Ao projetar o fim do mês, deixe claro que é projeção, e lembre que o mês
  atual está incompleto — não compare o total parcial dele com um mês fechado
  sem avisar disso.
- Se um dado necessário não está no resumo, não fale sobre ele.

SOBRE O CONTEÚDO
- A tela já mostra cada número sozinho num card, logo abaixo do seu texto.
  Repetir um valor isolado não acrescenta nada. Só cite um número quando ele
  estiver a serviço de uma comparação, de uma tendência ou de uma projeção.
- Seu trabalho é conectar o que está separado: cruzar categorias com
  trajetória, apontar o que mudou de direção, dizer aonde o ritmo atual leva.
- Prefira a tendência ao retrato: "era 38%, virou 43%" vale mais que "está em
  43%".
- Quando apontar um aumento, diga de onde ele veio, não só que houve.
- Cada parágrafo precisa dizer algo que a pessoa não conseguiria ver olhando
  os cards. Se um parágrafo só reorganiza números, corte-o.

SOBRE O TOM
- Direto e concreto, como um amigo que entende de dinheiro. Sem julgamento
  moral, sem "você deveria", sem paternalismo, sem alarmismo.
- Nada de emoji dentro do título ou dos parágrafos.

FORMATO
- "titulo": uma frase de no máximo 90 caracteres com a conclusão principal.
- "paragrafos": 2 a 3 parágrafos, cada um com no máximo 45 palavras.
- "acoes": 2 a 3 sugestões concretas e específicas. Cada uma tem:
  - "emoji": um único emoji que represente literalmente o assunto da ação —
    comida → 🍽️, viagem → ✈️, assinatura → 🔁, cartão de crédito → 💳, casa →
    🏠, transporte → 🚗, conta de luz → 💡, categorizar lançamentos → 🗂️,
    lazer → 🎉, salário → 💰. NUNCA use emoji genérico de marcador como 🏷️,
    📌, ✅, 📊, 📁 ou 🔍: se o emoji serviria para qualquer ação, ele está
    errado.
  - "texto": a ação no infinitivo, até 60 caracteres.
  - "impacto": até 45 caracteres. Sempre que houver base numérica no resumo,
    use um valor concreto em reais por mês (ex: "−R$ 240/mês" ou "R$ 613 fora
    da análise"). Só descreva o efeito em palavras quando não existir número
    que sustente a estimativa.
  - "destino": a aba do app onde a pessoa resolve isso, exatamente um destes
    valores — "contas" (saldos das contas), "cartoes" (faturas e assinaturas
    do cartão), "lancamentos" (entradas, saídas e recorrentes), "caixa"
    (lançamentos ainda sem categoria), "porquinhos" (metas de economia),
    "simulador" (simular o impacto de uma compra).`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    console.error('GEMINI_API_KEY não configurada')
    return json({ error: 'config', message: 'A chave do Gemini não está configurada.' }, 500)
  }

  let summary: unknown
  try {
    summary = (await req.json())?.summary
  } catch {
    summary = null
  }

  if (!summary || typeof summary !== 'object') {
    return json({ error: 'payload', message: 'Resumo ausente ou inválido.' }, 400)
  }

  let response: Response
  try {
    response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(summary) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.4,
          // Teto baixo de "pensamento": as contas já vêm prontas no resumo, e
          // o trabalho do modelo aqui é redação, não raciocínio numérico.
          // (thinkingBudget: 0 é recusado pelos modelos 3.x — daí o 128.)
          thinkingConfig: { thinkingBudget: 128 },
        },
      }),
    })
  } catch (err) {
    console.error('falha de rede ao chamar o Gemini', err)
    return json({ error: 'network', message: 'Não consegui falar com o Gemini agora.' }, 502)
  }

  if (!response.ok) {
    const detail = await response.text()
    console.error('Gemini respondeu', response.status, detail)

    // 429 é o caso esperado no plano gratuito: a cota do dia acabou. Vale uma
    // mensagem própria porque a saída é só esperar, não mexer em nada.
    if (response.status === 429) {
      return json(
        { error: 'quota', message: 'A cota gratuita do Gemini de hoje acabou. Tente amanhã.' },
        429,
      )
    }

    return json({ error: 'gemini', message: 'O Gemini não conseguiu responder agora.' }, 502)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    // Acontece quando o filtro de segurança do Gemini bloqueia a resposta:
    // vem 200 com candidato vazio, não um erro HTTP.
    console.error('resposta do Gemini sem texto', JSON.stringify(data).slice(0, 800))
    return json({ error: 'empty', message: 'O Gemini devolveu uma resposta vazia.' }, 502)
  }

  try {
    const parsed = JSON.parse(text)

    // O enum do schema já restringe o destino, mas a tela navega com esse
    // valor — conferir aqui custa uma linha e garante que nenhuma aba
    // inexistente chegue no front.
    const acoes = (parsed.acoes ?? []).map((acao: { destino?: string }) => ({
      ...acao,
      destino: DESTINOS.includes(acao.destino ?? '') ? acao.destino : null,
    }))

    return json({
      titulo: parsed.titulo,
      paragrafos: parsed.paragrafos ?? [],
      acoes,
      modelo: GEMINI_MODEL,
      geradoEm: new Date().toISOString(),
    })
  } catch (err) {
    console.error('JSON inválido vindo do Gemini', err, text.slice(0, 500))
    return json({ error: 'parse', message: 'A resposta do Gemini veio fora do formato.' }, 502)
  }
})
