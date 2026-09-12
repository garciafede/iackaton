import OpenAI from "openai";

export class MissingOpenAIApiKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY no está configurada");
    this.name = "MissingOpenAIApiKeyError";
  }
}

export class MissingOpenAIModelError extends Error {
  constructor() {
    super("OPENAI_MODEL no está configurado");
    this.name = "MissingOpenAIModelError";
  }
}

export const getOpenAIModel = (): string => {
  const model = process.env.OPENAI_MODEL?.trim();
  if (!model) throw new MissingOpenAIModelError();
  return model;
};

export const createOpenAIClient = (): OpenAI => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new MissingOpenAIApiKeyError();
  return new OpenAI({ apiKey });
};
