import { createHmac, timingSafeEqual } from "node:crypto";

import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { runProductAgent } from "../ai/agent.js";
import { safeErrorLog } from "../lib/safe-logging.js";
import { sendTextMessage } from "./client.js";
import { getWhatsAppAppSecret, getWhatsAppVerifyToken } from "./config.js";
import { MessageDeduplicator, WhatsAppSessionStore } from "./session.js";
import {handleMessage} from "./handle-message.js";
import type {compareCart} from "../ai/cart.js";
import type {geocodeAddress} from "./geocoding.js";
import {logConversation,type ConversationEvent} from "./conversation-log.js";
import type {IntentName} from "./intents.js";
import type {ConversationState} from "./session.js";

type VerificationQuery = {
	"hub.mode"?: string;
	"hub.verify_token"?: string;
	"hub.challenge"?: string;
};

export type WhatsAppMessage = {
	id?: string;
	from?: string;
	type?: string;
	text?: { body?: string };
	location?: { latitude?: number; longitude?: number };
};

type WhatsAppPayload = {
	entry?: Array<{
		changes?: Array<{
			value?: {
				messages?: WhatsAppMessage[];
				statuses?: unknown[];
			};
		}>;
	}>;
};

type RawBodyRequest = FastifyRequest & { rawBody?: Buffer };
type AsyncTask = () => Promise<void>;

export type WhatsAppWebhookDependencies = {
  logConversation?: (event:ConversationEvent)=>Promise<void>;
  onIntent?: (intent:IntentName,state:ConversationState)=>void;
  cartSearch?: typeof compareCart;
  geocode?: typeof geocodeAddress;
	agent: typeof runProductAgent;
	sendText: (to: string, body: string) => Promise<void>;
	sessions: WhatsAppSessionStore;
	deduplicator: MessageDeduplicator;
	getVerifyToken: () => string;
	getAppSecret: () => string;
	schedule: (task: AsyncTask) => void;
};

const defaultDependencies: WhatsAppWebhookDependencies = {
  logConversation,
	agent: (input) => runProductAgent({...input,compact:true}),
	sendText: sendTextMessage,
	sessions: new WhatsAppSessionStore(),
	deduplicator: new MessageDeduplicator(),
	getVerifyToken: getWhatsAppVerifyToken,
	getAppSecret: getWhatsAppAppSecret,
	schedule: (task) => {
		setImmediate(() => void task());
	},
};

export const validateWhatsAppSignature = (
	rawBody: Buffer,
	signature: string | undefined,
	appSecret: string,
): boolean => {
	if (!signature?.startsWith("sha256=")) return false;

	const received = Buffer.from(signature.slice("sha256=".length), "hex");
	const expected = createHmac("sha256", appSecret).update(rawBody).digest();
	return (
		received.length === expected.length &&
		timingSafeEqual(received, expected)
	);
};

const extractMessages = (payload: WhatsAppPayload): WhatsAppMessage[] =>
	payload.entry?.flatMap(
		(entry) =>
			entry.changes?.flatMap((change) => change.value?.messages ?? []) ??
			[],
	) ?? [];

const processMessage = handleMessage;

export const createWhatsAppWebhookRoutes = (
	dependencies: WhatsAppWebhookDependencies = defaultDependencies,
): FastifyPluginAsync => {
	return async (fastify) => {
		fastify.removeContentTypeParser("application/json");
		fastify.addContentTypeParser(
			"application/json",
			{ parseAs: "buffer" },
			(request, body, done) => {
				const rawBody = body as Buffer;
				(request as RawBodyRequest).rawBody = rawBody;
				try {
					done(null, JSON.parse(rawBody.toString("utf8")));
				} catch (error) {
					done(error as Error, undefined);
				}
			},
		);

		fastify.get<{ Querystring: VerificationQuery }>(
			"/webhooks/whatsapp",
			async (request, reply) => {
				const query = request.query;
				if (
					query["hub.mode"] === "subscribe" &&
					query["hub.verify_token"] === dependencies.getVerifyToken()
				) {
					return reply
						.type("text/plain")
						.status(200)
						.send(query["hub.challenge"] ?? "");
				}

				return reply
					.status(403)
					.send({ error: "WEBHOOK_VERIFICATION_FAILED" });
			},
		);

		fastify.post<{ Body: WhatsAppPayload }>(
			"/webhooks/whatsapp",
			async (request, reply) => {
				const rawBody = (request as RawBodyRequest).rawBody;
				const signatureHeader = request.headers["x-hub-signature-256"];
				const signature =
					typeof signatureHeader === "string"
						? signatureHeader
						: undefined;

				if (
					!rawBody ||
					!validateWhatsAppSignature(
						rawBody,
						signature,
						dependencies.getAppSecret(),
					)
				) {
					return reply
						.status(401)
						.send({ error: "INVALID_SIGNATURE" });
				}

				const messages = extractMessages(request.body);

				for (const message of messages) {
					dependencies.schedule(async () => {
						try {
							request.log.info(
								{
									event: "whatsapp.processing_start",
									messageId: message.id,
								},
								"Procesando mensaje de WhatsApp",
							);

							await processMessage(message, dependencies);

							request.log.info(
								{
									event: "whatsapp.processing_success",
									messageId: message.id,
								},
								"Mensaje de WhatsApp procesado correctamente",
							);
						} catch (error) {
							request.log.error(
								{
									event: "whatsapp.processing_error",
									messageId: message.id,

									error: safeErrorLog(error),
								},
								"Error procesando webhook de WhatsApp",
							);
						}
					});
				}

				return reply.status(200).send({ status: "received" });
			},
		);
	};
};

export const whatsappWebhookRoutes = createWhatsAppWebhookRoutes();
