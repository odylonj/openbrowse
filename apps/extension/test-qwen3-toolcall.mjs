/**
 * Test minimal pour valider que Qwen3-4B-q4f16_1-MLC peut faire du tool calling
 * via le mécanisme prompt-based de @browser-ai/web-llm (sans passer par l'API native de WebLLM).
 * 
 * Ce test :
 * 1. Charge le modèle Qwen3-4B-q4f16_1-MLC
 * 2. Envoie un prompt avec 3 outils fictifs (search, click, navigate)
 * 3. Vérifie que le modèle génère un appel structuré dans un fence ```tool_call
 */

import { webLLM } from "@browser-ai/web-llm";
import { generateText, streamText } from "ai";

const MODEL_ID = "Qwen3-4B-q4f16_1-MLC";

// 3 outils fictifs pour l'agent navigateur
const tools = [
  {
    type: "function",
    name: "search",
    description: "Recherche sur le web et retourne les premiers résultats",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Requête de recherche" },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "click",
    description: "Clique sur un élément de la page",
    parameters: {
      type: "object",
      properties: {
        element: { type: "string", description: "Sélecteur CSS ou description de l'élément" },
      },
      required: ["element"],
    },
  },
  {
    type: "function",
    name: "navigate",
    description: "Navigue vers une URL",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL à ouvrir" },
      },
      required: ["url"],
    },
  },
];

async function testToolCall() {
  console.log(`\n=== Test Qwen3 4B tool calling (${MODEL_ID}) ===\n`);

  const model = webLLM(MODEL_ID, {
    initProgressCallback: (report) => {
      const pct = Math.round((report.progress ?? 0) * 100);
      console.log(`[Download] ${pct}% - ${report.text}`);
    },
  });

  // Test 1: Appel d'un outil unique
  console.log("--- Test 1: Appel d'un outil unique ---");
  try {
    const result = await generateText({
      model,
      system: "Tu es un agent navigateur. Utilise les outils fournis.",
      prompt: "L'utilisateur veut chercher 'IUT de Laval' sur Google. Choisis l'outil approprié et appelle-le.",
      tools,
      maxOutputTokens: 512,
      temperature: 0,
    });
    console.log("Réponse:", result.text);
    console.log("Tool calls:", result.toolCalls);
  } catch (e) {
    console.error("Erreur Test 1:", e.message);
  }

  // Test 2: Choix entre plusieurs outils
  console.log("\n--- Test 2: Choix entre plusieurs outils ---");
  try {
    const result = await generateText({
      model,
      system: "Tu es un agent navigateur. Utilise les outils fournis.",
      prompt: "L'utilisateur dit : 'Va sur Google et cherche IUT de Laval'. Deux actions sont nécessaires. Choisis les bons outils dans l'ordre.",
      tools,
      maxOutputTokens: 1024,
      temperature: 0,
    });
    console.log("Réponse:", result.text);
    console.log("Tool calls:", result.toolCalls);
  } catch (e) {
    console.error("Erreur Test 2:", e.message);
  }

  // Test 3: Deux appels successifs (conversation multi-tour)
  console.log("\n--- Test 3: Conversation multi-tour (navigation puis extraction) ---");
  try {
    // Tour 1: navigate
    const result1 = await generateText({
      model,
      system: "Tu es un agent navigateur. Utilise les outils fournis.",
      prompt: "L'utilisateur dit : 'Va sur https://www.google.com'. Appelle l'outil navigate.",
      tools,
      maxOutputTokens: 512,
      temperature: 0,
    });
    console.log("Tour 1 - Réponse:", result1.text);
    console.log("Tour 1 - Tool calls:", result1.toolCalls);

    // Simuler un résultat d'outil
    const messages = [
      { role: "user", content: "L'utilisateur dit : 'Va sur https://www.google.com'. Appelle l'outil navigate." },
      { role: "assistant", content: result1.text },
      { role: "tool", content: JSON.stringify({ result: "Page Google chargée", url: "https://www.google.com" }) },
      { role: "user", content: "Maintenant cherche 'IUT de Laval' sur cette page." },
    ];

    const result2 = await generateText({
      model,
      system: "Tu es un agent navigateur. Utilise les outils fournis.",
      prompt: messages,
      tools,
      maxOutputTokens: 512,
      temperature: 0,
    });
    console.log("Tour 2 - Réponse:", result2.text);
    console.log("Tour 2 - Tool calls:", result2.toolCalls);
  } catch (e) {
    console.error("Erreur Test 3:", e.message);
  }

  // Test 4: Streaming
  console.log("\n--- Test 4: Streaming tool call ---");
  try {
    const { textStream } = streamText({
      model,
      system: "Tu es un agent navigateur. Utilise les outils fournis.",
      prompt: "Cherche 'formations IUT Laval' sur Google.",
      tools,
      maxOutputTokens: 512,
      temperature: 0,
    });

    let fullText = "";
    for await (const delta of textStream) {
      fullText += delta;
      process.stdout.write(delta);
    }
    console.log("\n--- Fin stream ---");
  } catch (e) {
    console.error("Erreur Test 4:", e.message);
  }

  console.log("\n=== Tests terminés ===");
}

testToolCall().catch(console.error);