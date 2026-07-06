export function qualifyModelForProvider(model: string, providerId?: string): string {
  const trimmed = model.trim();
  const provider = providerId?.trim();

  if (!trimmed || !provider || trimmed.includes(":")) {
    return trimmed;
  }

  return `${provider}:${trimmed}`;
}

export function splitModelIds(value: string): string[] {
  return value
    .split(/[,\n，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
