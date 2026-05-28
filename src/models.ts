import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider-v2";
import { ModelConfig } from "./data";
import { type LanguageModel } from "ai";

export function createModel(config: ModelConfig): LanguageModel {
  let model: LanguageModel;
  switch (config.provider) {
    case "google":
      model = google(config.modelName);
      break;
    case "openai":
      const openai = createOpenAI({
        apiKey: config.apiKey || "sk-local-dummy",
        baseURL: config.baseUrl || "https://api.openai.com/v1",
      });
      model = openai(config.modelName);
      break;
    case "ollama":
      const ollama = createOllama({
        baseURL: config.baseUrl || "http://localhost:11434/api",
      });
      model = ollama(config.modelName);
      break;
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
  (model as any).agentConfig = config;
  return model;
}
