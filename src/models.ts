import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider-v2";
import { ModelConfig } from "./data";
import { type LanguageModel } from "ai";

export function createModel(config: ModelConfig): LanguageModel {
  switch (config.provider) {
    case "google":
      return google(config.modelName);
    case "openai":
      const openai = createOpenAI({
        apiKey: config.apiKey || "sk-local-dummy",
        baseURL: config.baseUrl || "https://api.openai.com/v1",
      });
      return openai(config.modelName);
    case "ollama":
      const ollama = createOllama({
        baseURL: config.baseUrl || "http://localhost:11434/api",
      });
      return ollama(config.modelName);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
