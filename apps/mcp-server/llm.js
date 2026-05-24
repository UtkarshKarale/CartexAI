const LLM_URL = 'http://localhost:8081/v1/chat/completions';

async function llmChat(messages, maxTokens = 50) {
  const response = await fetch(LLM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0 })
  });
  if (!response.ok) throw new Error(`LLM server error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

module.exports = { llmChat };