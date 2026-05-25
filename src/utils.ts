/**
 * Simple utility to check if a model likely supports vision.
 * Standardizes detection across different providers.
 */
export function isVisionModel(provider: string, modelName: string, configuredSupportsVision?: boolean): boolean {
  if (configuredSupportsVision !== undefined) {
    return configuredSupportsVision;
  }
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
    const visionKeywords = [
      "vision",
      "llava",
      "moondream",
      "minicpm-v",
      "bakllava",
      "vl",
    ];
    return visionKeywords.some((keyword) => name.includes(keyword));
  }

  // Default to false for unknown models/providers to be safe
  return false;
}

/**
 * Ensures that image data is formatted as a "file" part with a base64-encoded string,
 * which is critical for ollama-ai-provider-v2 compatibility, as it only extracts
 * image data from "file" parts and expects a base64 string to avoid unmarshaling failures.
 */
export function prepareImagePart(image: Buffer | Uint8Array | string): {
  type: "file";
  data: string;
  mediaType: string;
} {
  let base64Data: string;
  if (typeof image === "string") {
    if (image.startsWith("data:")) {
      base64Data = image.split(",")[1];
    } else {
      base64Data = image;
    }
  } else {
    base64Data = Buffer.from(image).toString("base64");
  }

  return {
    type: "file" as const,
    data: base64Data,
    mediaType: "image/png",
  };
}
