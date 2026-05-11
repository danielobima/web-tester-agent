/**
 * Simple utility to check if a model likely supports vision.
 * Standardizes detection across different providers.
 */
export function isVisionModel(provider: string, modelName: string): boolean {
  const name = modelName.toLowerCase();
  
  // Google Gemini models usually support vision
  if (provider === "google") {
    return name.includes("gemini");
  }
  
  // OpenAI models
  if (provider === "openai") {
    return name.includes("gpt-4") || name.includes("o1") || name.includes("o3");
  }

  // Anthropic models
  if (provider === "anthropic") {
    return name.includes("claude-3");
  }

  // Ollama vision models usually have specific keywords
  if (provider === "ollama") {
    const visionKeywords = ["vision", "llava", "moondream", "minicpm-v", "bakllava", "qwen2-vl"];
    return visionKeywords.some(keyword => name.includes(keyword));
  }

  // Default to false for unknown models/providers to be safe
  return false;
}
