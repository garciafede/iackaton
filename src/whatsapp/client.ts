import { getWhatsAppClientConfig } from "./config.js";

type SendTextDependencies = {
  fetch: typeof globalThis.fetch;
  getConfig: typeof getWhatsAppClientConfig;
};

const defaultDependencies: SendTextDependencies = {
  fetch: globalThis.fetch,
  getConfig: getWhatsAppClientConfig,
};

export const normalizeMetaTestRecipient = (recipient: string): string => {
  if (recipient.startsWith("549")) {
    return "54" + recipient.substring(3);
  }

  return recipient;
};

const maskRecipient = (recipient: string): string =>
  recipient.length > 6
    ? recipient.slice(0, 2) + "*".repeat(recipient.length - 6) + recipient.slice(-4)
    : "*".repeat(recipient.length);

export const sendTextMessage = async (
  to: string,
  body: string,
  dependencies: SendTextDependencies = defaultDependencies,
): Promise<void> => {
  const { accessToken, phoneNumberId, graphApiVersion } = dependencies.getConfig();
  const recipientFinal =
    process.env.NODE_ENV === "development" ? normalizeMetaTestRecipient(to) : to;
  const url = `https://graph.facebook.com/${encodeURIComponent(graphApiVersion)}/${encodeURIComponent(phoneNumberId)}/messages`;
  const messageType = "text";

  // Diagnóstico temporal: no registrar headers, credenciales ni el texto enviado.
  console.info("Meta Graph API request:", {
    graphApiVersion,
    phoneNumberId,
    recipientOriginal: maskRecipient(to),
    recipientFinal: maskRecipient(recipientFinal),
    recipientLength: recipientFinal.length,
    messageType,
  });
  const response = await dependencies.fetch(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientFinal,
        type: messageType,
        text: { preview_url: false, body },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    let metaError: {
      error?: {
        code?: unknown;
        error_subcode?: unknown;
        message?: unknown;
        error_data?: { details?: unknown };
      };
    } | undefined;

    try {
      metaError = JSON.parse(errorBody);
    } catch {
      // No registrar un cuerpo no JSON que pudiera contener datos sensibles.
    }

    const safeErrorText = (value: unknown): string | undefined => {
      if (typeof value !== "string") return undefined;
      let text = value;
      for (const secret of [
        accessToken,
        process.env.WHATSAPP_APP_SECRET,
        process.env.DATABASE_URL,
        process.env.OPENAI_API_KEY,
      ]) {
        if (secret) text = text.split(secret).join("[REDACTED]");
      }
      return text.replace(/\+?\d{7,}/g, (phone) => maskRecipient(phone.replace(/^\+/, "")));
    };
    const error = metaError?.error;
    const diagnostic = {
      status: response.status,
      error: {
        code: typeof error?.code === "number" ? error.code : undefined,
        error_subcode: typeof error?.error_subcode === "number" ? error.error_subcode : undefined,
        message: safeErrorText(error?.message),
        error_data: { details: safeErrorText(error?.error_data?.details) },
      },
    };
    console.error("Meta Graph API error:", diagnostic);

    throw new Error(
      `Meta Graph API respondió HTTP ${response.status}: ${JSON.stringify(diagnostic.error)}`,
    );
  }
};
