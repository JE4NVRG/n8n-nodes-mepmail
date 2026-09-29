import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
	IDataObject,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

type MepMailCredentials = {
	baseUrl: string;
	apiKey: string;
};

const eventOptions = [
	{ name: 'Contact Created', value: 'contact.created' },
	{ name: 'Contact Deleted', value: 'contact.deleted' },
	{ name: 'Contact Resubscribed', value: 'contact.resubscribed' },
	{ name: 'Contact Topic Opt In', value: 'contact.topic_opt_in' },
	{ name: 'Contact Topic Opt Out', value: 'contact.topic_opt_out' },
	{ name: 'Contact Unsubscribed', value: 'contact.unsubscribed' },
	{ name: 'Contact Updated', value: 'contact.updated' },
	{ name: 'Deliverability Paused', value: 'deliverability.paused' },
	{ name: 'Deliverability Warning', value: 'deliverability.warning' },
	{ name: 'Email Bounced', value: 'email.bounced' },
	{ name: 'Email Clicked', value: 'email.clicked' },
	{ name: 'Email Complained', value: 'email.complained' },
	{ name: 'Email Delivered', value: 'email.delivered' },
	{ name: 'Email Delivery Delayed', value: 'email.delivery_delayed' },
	{ name: 'Email Opened', value: 'email.opened' },
	{ name: 'Email Prefetched', value: 'email.prefetched' },
	{ name: 'Email Sent', value: 'email.sent' },
	{ name: 'Quota Paused', value: 'quota.paused' },
	{ name: 'Quota Reached', value: 'quota.reached' },
	{ name: 'Quota Warning', value: 'quota.warning' },
	{ name: 'Suppression Added', value: 'suppression.added' },
	{ name: 'Suppression Removed', value: 'suppression.removed' },
];

const MAX_TIMESTAMP_DRIFT_SECONDS = 5 * 60;

async function mepMailApiRequest(
	context: IHookFunctions | IWebhookFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
): Promise<IDataObject> {
	const credentials = (await context.getCredentials('mepMailApi')) as MepMailCredentials;
	const baseUrl = String(credentials.baseUrl ?? '').replace(/\/+$/, '');
	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		json: true,
		headers: { Authorization: `Bearer ${credentials.apiKey}` },
	};
	if (body) {
		options.body = body;
	}
	return (await context.helpers.httpRequest(options)) as IDataObject;
}

function pickHeader(headers: Record<string, unknown>, names: string[]): string | undefined {
	for (const name of names) {
		const value = headers[name];
		if (typeof value === 'string' && value.length > 0) {
			return value;
		}
		if (Array.isArray(value) && typeof value[0] === 'string') {
			return value[0];
		}
	}
	return undefined;
}

/**
 * Standard Webhooks / Svix-compatible verification: the signed content is
 * `{id}.{timestamp}.{raw body}` and the signature is a base64 HMAC-SHA256 of
 * it, keyed by the base64-decoded signing secret (after the `whsec_` prefix).
 */
function verifySignature(
	rawBody: string,
	headers: Record<string, unknown>,
	signingSecret: string,
): boolean {
	const id = pickHeader(headers, ['webhook-id', 'svix-id']);
	const timestamp = pickHeader(headers, ['webhook-timestamp', 'svix-timestamp']);
	const signature = pickHeader(headers, ['webhook-signature', 'svix-signature']);
	if (!id || !timestamp || !signature) {
		return false;
	}

	const driftSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
	if (!Number.isFinite(driftSeconds) || driftSeconds > MAX_TIMESTAMP_DRIFT_SECONDS) {
		return false;
	}

	const key = Buffer.from(signingSecret.replace(/^whsec_/, ''), 'base64');
	const expected = createHmac('sha256', key)
		.update(`${id}.${timestamp}.${rawBody}`)
		.digest('base64');

	return signature
		.split(' ')
		.map((part) => part.split(',')[1])
		.filter((candidate): candidate is string => Boolean(candidate))
		.some((candidate) => {
			const given = Buffer.from(candidate);
			const wanted = Buffer.from(expected);
			return given.length === wanted.length && timingSafeEqual(given, wanted);
		});
}

export class MepMailTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MepMail Trigger',
		name: 'mepMailTrigger',
		icon: { light: 'file:mepmail.svg', dark: 'file:mepmail.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts the workflow when MepMail sends a webhook event, such as an email being delivered or bounced',
		defaults: { name: 'MepMail Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'mepMailApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'mepmail',
			},
		],
		properties: [
			{
				displayName:
					'The webhook subscription in MepMail is created, updated and removed automatically when this workflow is activated or deactivated. Changing the events below takes effect on the next activation.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['email.delivered'],
				options: eventOptions,
				description:
					'Event types to subscribe to. Events not selected here are acknowledged and ignored by the trigger.',
			},
			{
				displayName: 'Signing Secret',
				name: 'signingSecret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description:
					"Optional: override the endpoint's signing secret (whsec_...) used to verify incoming events. Leave empty to use the secret issued by MepMail when the subscription was created.",
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const webhookId = staticData.webhookId as string | undefined;
				if (!webhookId) {
					return false;
				}
				const desiredEvents = ((this.getNodeParameter('events') as string[]) ?? [])
					.slice()
					.sort();
				try {
					const found = await mepMailApiRequest(
						this,
						'GET',
						`/webhooks/${encodeURIComponent(webhookId)}`,
					);
					if (found.signing_secret) {
						staticData.webhookSecret = found.signing_secret;
					}
					const currentUrl = this.getNodeWebhookUrl('default') ?? '';
					const sameEndpoint = String(found.endpoint ?? '') === String(currentUrl);
					const currentEvents = ((found.events as string[]) ?? []).slice().sort();
					const sameEvents =
						desiredEvents.length === currentEvents.length &&
						desiredEvents.every((event, index) => event === currentEvents[index]);
					return sameEndpoint && sameEvents;
				} catch {
					delete staticData.webhookId;
					delete staticData.webhookSecret;
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const webhookUrl = this.getNodeWebhookUrl('default') ?? '';
				const events = (this.getNodeParameter('events') as string[]) ?? [];
				if (events.length === 0) {
					throw new NodeOperationError(this.getNode(), 'Select at least one event to subscribe to');
				}

				const webhookId = staticData.webhookId as string | undefined;
				if (webhookId) {
					try {
						const updated = await mepMailApiRequest(
							this,
							'PATCH',
							`/webhooks/${encodeURIComponent(webhookId)}`,
							{ endpoint: webhookUrl, events },
						);
						if (updated.signing_secret) {
							staticData.webhookSecret = updated.signing_secret;
						}
						return true;
					} catch {
						delete staticData.webhookId;
						delete staticData.webhookSecret;
					}
				}

				const created = await mepMailApiRequest(this, 'POST', '/webhooks', {
					endpoint: webhookUrl,
					events,
				});
				staticData.webhookId = created.id;
				if (created.signing_secret) {
					staticData.webhookSecret = created.signing_secret;
				}
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const webhookId = staticData.webhookId as string | undefined;
				if (webhookId) {
					try {
						await mepMailApiRequest(this, 'DELETE', `/webhooks/${encodeURIComponent(webhookId)}`);
					} catch (error) {
						// The subscription may already be gone (e.g. removed in the dashboard).
						this.logger.warn(
							`MepMail webhook ${webhookId} could not be removed: ${(error as Error).message}`,
						);
					}
					delete staticData.webhookId;
					delete staticData.webhookSecret;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;

		const staticData = this.getWorkflowStaticData('node');
		const signingSecret =
			(((this.getNodeParameter('signingSecret', '') as string) ?? '').trim() ||
				String(staticData.webhookSecret ?? '').trim()) ||
			'';
		if (signingSecret) {
			const request = this.getRequestObject();
			const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
			if (!rawBody) {
				throw new NodeOperationError(
					this.getNode(),
					'Cannot verify the webhook signature because the raw request body is unavailable. Clear the Signing Secret field or use a newer n8n version.',
				);
			}
			const headers = this.getHeaderData() as Record<string, unknown>;
			if (!verifySignature(rawBody.toString('utf8'), headers, signingSecret)) {
				throw new NodeOperationError(this.getNode(), 'Invalid webhook signature');
			}
		}

		const selectedEvents = (this.getNodeParameter('events', []) as string[]) ?? [];
		const eventType = typeof body.type === 'string' ? body.type : '';
		if (selectedEvents.length > 0 && eventType && !selectedEvents.includes(eventType)) {
			return { workflowData: [] };
		}

		return { workflowData: [this.helpers.returnJsonArray(body)] };
	}
}
