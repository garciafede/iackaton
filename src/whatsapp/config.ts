type WhatsAppClientConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
};

const requireEnvironmentVariable = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} no está configurada`);
  return value;
};

export const getWhatsAppClientConfig = (): WhatsAppClientConfig => ({
  accessToken: requireEnvironmentVariable("WHATSAPP_ACCESS_TOKEN"),
  phoneNumberId: requireEnvironmentVariable("WHATSAPP_PHONE_NUMBER_ID"),
  graphApiVersion: requireEnvironmentVariable("WHATSAPP_GRAPH_API_VERSION"),
});

export const getWhatsAppVerifyToken = () =>
  requireEnvironmentVariable("WHATSAPP_VERIFY_TOKEN");

export const getWhatsAppAppSecret = () =>
  requireEnvironmentVariable("WHATSAPP_APP_SECRET");
