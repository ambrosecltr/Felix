import { type FelixSettings } from "@felix/contracts";

export const XAI_ICON_MODEL = "grok-imagine-image-quality";

const XAI_API_BASE_URL = "https://api.x.ai/v1";
const SETUP_CHECK_TIMEOUT_MS = 10_000;
const IMAGE_GENERATION_TIMEOUT_MS = 120_000;

export interface GeneratedIconImage {
  bytes: Buffer;
  mimeType: string;
}

export function iconGenerationApiKey(settings: FelixSettings): string | null {
  if (!settings.iconGeneration.enabled) return null;
  const apiKey = settings.iconGeneration.xaiApiKey.trim();
  return apiKey.length > 0 ? apiKey : null;
}

export async function checkIconGenerationSetup(settings: FelixSettings): Promise<void> {
  if (!settings.iconGeneration.enabled) return;

  const apiKey = iconGenerationApiKey(settings);
  if (!apiKey) {
    throw new Error("Enter an xAI API key before enabling generated mini app icons.");
  }

  const modelAvailable = await checkModelAvailability(apiKey);
  if (!modelAvailable) {
    throw new Error(`${XAI_ICON_MODEL} is not available for this xAI API key.`);
  }
}

export async function generateMiniAppIcon(
  apiKey: string,
  appDescription: string,
): Promise<GeneratedIconImage> {
  const prompt = miniAppIconPrompt(appDescription);
  const response = await fetch(`${XAI_API_BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: XAI_ICON_MODEL,
      prompt,
      n: 1,
      aspect_ratio: "1:1",
      resolution: "1k",
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("xAI authorization failed. Check the saved API key.");
  }

  if (!response.ok) {
    throw new Error(`xAI image generation failed with HTTP ${response.status}.`);
  }

  const payload: unknown = await response.json();
  const data = readArrayProperty(payload, "data");
  const first = data?.find(isRecord);
  if (!first) throw new Error("xAI image generation returned no image.");

  const b64Json = readStringProperty(first, "b64_json");
  if (b64Json) {
    const bytes = Buffer.from(b64Json, "base64");
    return { bytes, mimeType: detectImageMimeType(bytes) ?? "image/jpeg" };
  }

  const imageUrl = readStringProperty(first, "url");
  if (imageUrl) return downloadGeneratedImage(imageUrl);

  throw new Error("xAI image generation did not return image bytes or a URL.");
}

async function checkModelAvailability(apiKey: string): Promise<boolean> {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const listResponse = await fetch(`${XAI_API_BASE_URL}/models`, {
    headers,
    signal: AbortSignal.timeout(SETUP_CHECK_TIMEOUT_MS),
  });

  if (listResponse.status === 401 || listResponse.status === 403) {
    throw new Error("xAI authorization failed. Check the API key and try saving again.");
  }

  if (!listResponse.ok) {
    throw new Error(`Could not check xAI models. HTTP ${listResponse.status}.`);
  }

  const payload: unknown = await listResponse.json();
  const models = readArrayProperty(payload, "data") ?? [];
  if (
    models.some((entry) => isRecord(entry) && readStringProperty(entry, "id") === XAI_ICON_MODEL)
  ) {
    return true;
  }

  return checkModelById(apiKey);
}

async function checkModelById(apiKey: string): Promise<boolean> {
  const response = await fetch(`${XAI_API_BASE_URL}/models/${XAI_ICON_MODEL}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(SETUP_CHECK_TIMEOUT_MS),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("xAI authorization failed. Check the API key and try saving again.");
  }
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Could not check xAI image model. HTTP ${response.status}.`);
  return true;
}

async function downloadGeneratedImage(imageUrl: string): Promise<GeneratedIconImage> {
  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Could not download generated icon. HTTP ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  return {
    bytes,
    mimeType: detectImageMimeType(bytes) ?? contentType ?? "image/jpeg",
  };
}

function miniAppIconPrompt(appDescription: string): string {
  return `Create a 1:1 square illustration asset for use as an app icon.

Important output format:
The entire image is the final icon artwork. Do not draw an app icon inside the image. Do not draw a rounded-square tile, inset card, frame, border, shadow, mockup, or background canvas around the artwork. The background color must fill the whole square image edge to edge. Felix will handle rounded corners and icon masking later.

App description:
${appDescription}

Design style:
Playful, kid-friendly, polished cartoon illustration. Use simple flat vector-like shapes, bold readable silhouettes, thick clean outlines, rounded forms, and bright high-contrast colors. The image should feel like a cheerful toy-like symbol made for a kid's app, not a realistic illustration.

Composition:
Use the icon concept as the only main subject. Make it large, centered, and easy to recognize at small sizes. Include at most one simple supporting detail if it helps explain the app. Do not add unrelated mascots, animals, characters, props, or scenery that are not implied by the app description or icon concept.

Background:
Use one simple solid background color, such as soft off-white, pale mint, light yellow, light sky blue, or another cheerful color that complements the subject. The background must extend all the way to the image edges.

Visual rules:
No text, no letters, no numbers, no UI screenshots, no app-store mockup, no nested icon, no inset rounded square, no border, no complex scenery, no tiny details, no realistic rendering, no 3D, no heavy shadows, no photographic texture, no gradients except very subtle flat highlights. Avoid looking like an existing copyrighted character or logo.`;
}

function detectImageMimeType(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function readArrayProperty(value: unknown, key: string): unknown[] | null {
  if (!isRecord(value)) return null;
  const property = value[key];
  return Array.isArray(property) ? property : null;
}

function readStringProperty(value: Record<string, unknown>, key: string): string | null {
  const property = value[key];
  return typeof property === "string" ? property : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
