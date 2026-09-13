import { createHmac, timingSafeEqual } from "node:crypto";

import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { runProductAgent } from "../ai/agent.js";
import { followupSort, isGreeting } from "../ai/conversation.js";
import { safeErrorLog } from "../lib/safe-logging.js";
import { sendTextMessage } from "./client.js";
import { getWhatsAppAppSecret, getWhatsAppVerifyToken } from "./config.js";
import { MessageDeduplicator, WhatsAppSessionStore } from "./session.js";

type VerificationQuery = {
	"hub.mode"?: string;
	"hub.verify_token"?: string;
	"hub.challenge"?: string;
};

type WhatsAppMessage = {
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

type WhatsAppWebhookDependencies = {
	agent: typeof runProductAgent;
	sendText: (to: string, body: string) => Promise<void>;
	sessions: WhatsAppSessionStore;
	deduplicator: MessageDeduplicator;
	getVerifyToken: () => string;
	getAppSecret: () => string;
	schedule: (task: AsyncTask) => void;
};

const defaultDependencies: WhatsAppWebhookDependencies = {
	agent: runProductAgent,
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

const processMessage = async (
	message: WhatsAppMessage,
	dependencies: WhatsAppWebhookDependencies,
): Promise<void> => {
	const { id, from, type } = message;
	if (!id || !from || !type || dependencies.deduplicator.hasSeen(id)) return;

	const session = dependencies.sessions.get(from);

	if (type === "text") {
		const text = message.text?.body?.trim();
		if (!text) return;
		if (isGreeting(text)) {
			const result = await dependencies.agent({ message: text });
			await dependencies.sendText(from, result.message);
			return;
		}

		if (
			session?.latitude !== undefined &&
			session.longitude !== undefined
		) {
			dependencies.sessions.update(from, {
				latitude: session.latitude,
				longitude: session.longitude,
				...(session.previousSearch ? { previousSearch: session.previousSearch } : {}),
			});
			const result = await dependencies.agent({
				message: text,
				latitude: session.latitude,
				longitude: session.longitude,
				...(session.previousSearch ? { previousSearch: session.previousSearch } : {}),
			});
			if (result.toolArguments) dependencies.sessions.update(from, {
				latitude: session.latitude, longitude: session.longitude,
				previousSearch: { query: result.toolArguments.query, sort: result.toolArguments.sort, radiusKm: result.toolArguments.radiusKm ?? null },
			});
			await dependencies.sendText(from, result.message);
			return;
		}

		const pendingMessage = followupSort(text) && session?.pendingMessage ? `${session.pendingMessage}. ${text}` : text;
		dependencies.sessions.update(from, { pendingMessage });
		const result = await dependencies.agent({ message: pendingMessage });
		await dependencies.sendText(from, result.message);
		return;
	}

	if (type === "location") {
		const latitude = message.location?.latitude;
		const longitude = message.location?.longitude;
		if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
			await dependencies.sendText(from, "No pude leer esa ubicación. Compartila nuevamente desde WhatsApp.");
			return;
		}

		if (session?.pendingMessage) {
			dependencies.sessions.update(from, { latitude, longitude });
			const result = await dependencies.agent({
				message: session.pendingMessage,
				latitude,
				longitude,
			});
			if (result.toolArguments) dependencies.sessions.update(from, {
				latitude, longitude,
				previousSearch: { query: result.toolArguments.query, sort: result.toolArguments.sort, radiusKm: result.toolArguments.radiusKm ?? null },
			});
			await dependencies.sendText(from, result.message);
			return;
		}

		dependencies.sessions.update(from, { latitude, longitude, ...(session?.previousSearch ? { previousSearch: session.previousSearch } : {}) });
		await dependencies.sendText(
			from,
			"Ubicación recibida. Ahora decime qué producto querés buscar.",
		);
		return;
	}

	await dependencies.sendText(
		from,
		"Por ahora puedo recibir mensajes de texto y ubicaciones.",
	);
};

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
