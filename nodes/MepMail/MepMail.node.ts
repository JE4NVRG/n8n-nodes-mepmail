import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

type MepMailCredentials = {
	baseUrl: string;
};

const resourceOptions: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Broadcast', value: 'broadcast' },
		{ name: 'Contact', value: 'contact' },
		{ name: 'Domain', value: 'domain' },
		{ name: 'Email', value: 'email' },
		{ name: 'Suppression', value: 'suppression' },
		{ name: 'Usage', value: 'usage' },
	],
	default: 'email',
};

const emailOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['email'] } },
	options: [
		{
			name: 'Cancel',
			value: 'cancel',
			description: 'Cancel a scheduled email',
			action: 'Cancel a scheduled email',
		},
		{
			name: 'Delete',
			value: 'delete',
			description: 'Delete an email and its stored body',
			action: 'Delete an email',
		},
		{ name: 'Get', value: 'get', description: 'Get an email by ID', action: 'Get an email' },
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'List sent emails',
			action: 'List emails',
		},
		{ name: 'Send', value: 'send', description: 'Send an email', action: 'Send an email' },
	],
	default: 'send',
};

const emailFields: INodeProperties[] = [
	{
		displayName: 'From',
		name: 'from',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Acme <onboarding@yourdomain.com>',
		displayOptions: { show: { resource: ['email'], operation: ['send'] } },
		description: 'Sender address; the domain must be verified for your team',
	},
	{
		displayName: 'To',
		name: 'to',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'recipient@example.com, other@example.com',
		displayOptions: { show: { resource: ['email'], operation: ['send'] } },
		description: 'Recipient address or comma-separated list of up to 50 recipients',
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['email'], operation: ['send'] } },
		description: 'Email subject line',
	},
	{
		displayName: 'HTML',
		name: 'html',
		type: 'string',
		typeOptions: { rows: 5 },
		default: '',
		displayOptions: { show: { resource: ['email'], operation: ['send'] } },
		description: 'HTML body of the email. Provide HTML and/or Text.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['email'], operation: ['send'] } },
		options: [
			{
				displayName: 'BCC',
				name: 'bcc',
				type: 'string',
				default: '',
				description: 'BCC address or comma-separated list',
			},
			{
				displayName: 'CC',
				name: 'cc',
				type: 'string',
				default: '',
				description: 'CC address or comma-separated list',
			},
			{
				displayName: 'Reply To',
				name: 'reply_to',
				type: 'string',
				default: '',
				description: 'Reply-to address or comma-separated list',
			},
			{
				displayName: 'Scheduled At',
				name: 'scheduled_at',
				type: 'string',
				default: '',
				description:
					'Deliver later: ISO 8601 with offset (e.g. 2026-09-01T12:00:00Z) or relative (e.g. "in 2 hours"); max 30 days ahead.',
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Plain-text body of the email',
			},
			{
				displayName: 'Topic ID',
				name: 'topic_id',
				type: 'string',
				default: '',
				description: 'Topic ID to scope the unsubscribe link and suppression filtering',
			},
		],
	},
	{
		displayName: 'Headers',
		name: 'headers',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Header',
		default: {},
		displayOptions: { show: { resource: ['email'], operation: ['send'] } },
		options: [
			{
				name: 'header',
				displayName: 'Header',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Header name, e.g. X-Custom-Header',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Header value',
					},
				],
			},
		],
	},
	{
		displayName: 'Tags',
		name: 'tags',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Tag',
		default: {},
		displayOptions: { show: { resource: ['email'], operation: ['send'] } },
		options: [
			{
				name: 'tag',
				displayName: 'Tag',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Tag name',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Tag value',
					},
				],
			},
		],
	},
	{
		displayName: 'Attachments',
		name: 'attachments',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Attachment',
		default: {},
		displayOptions: { show: { resource: ['email'], operation: ['send'] } },
		options: [
			{
				name: 'attachment',
				displayName: 'Attachment',
				values: [
					{
						displayName: 'Filename',
						name: 'filename',
						type: 'string',
						default: '',
						description: 'Name of the attached file, e.g. invoice.pdf',
					},
					{
						displayName: 'Content (Base64)',
						name: 'content',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						description:
							'Base64-encoded file content; remote URLs are not supported. Use an expression to read a binary file (e.g. from a previous node).',
					},
					{
						displayName: 'Content Type',
						name: 'content_type',
						type: 'string',
						default: '',
						description: 'MIME type of the attachment, e.g. application/pdf',
					},
				],
			},
		],
	},
	{
		displayName: 'Email ID',
		name: 'emailId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: { resource: ['email'], operation: ['get', 'cancel', 'delete'] },
		},
		description: 'ID of the email to operate on',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['email'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['email'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
];

const contactOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['contact'] } },
	options: [
		{ name: 'Create', value: 'create', description: 'Create a contact', action: 'Create a contact' },
		{ name: 'Delete', value: 'delete', description: 'Delete a contact', action: 'Delete a contact' },
		{
			name: 'Get',
			value: 'get',
			description: 'Get a contact by ID or email',
			action: 'Get a contact',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'List contacts',
			action: 'List contacts',
		},
		{ name: 'Update', value: 'update', description: 'Update a contact', action: 'Update a contact' },
	],
	default: 'create',
};

const contactFields: INodeProperties[] = [
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['contact'], operation: ['create'] } },
		description: 'Email address of the contact',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['create'] } },
		options: [
			{
				displayName: 'First Name',
				name: 'first_name',
				type: 'string',
				default: '',
				description: 'First name of the contact',
			},
			{
				displayName: 'Last Name',
				name: 'last_name',
				type: 'string',
				default: '',
				description: 'Last name of the contact',
			},
			{
				displayName: 'Properties',
				name: 'properties',
				type: 'json',
				default: {},
				description: 'Custom properties for the contact',
			},
			{
				displayName: 'Unsubscribed',
				name: 'unsubscribed',
				type: 'boolean',
				default: false,
				description: 'Whether the contact is unsubscribed from all emails',
			},
		],
	},
	{
		displayName: 'Contact ID or Email',
		name: 'contactId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: { resource: ['contact'], operation: ['get', 'update', 'delete'] },
		},
		description: 'ID or email address of the contact',
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['update'] } },
		options: [
			{
				displayName: 'First Name',
				name: 'first_name',
				type: 'string',
				default: '',
				description: 'First name of the contact',
			},
			{
				displayName: 'Last Name',
				name: 'last_name',
				type: 'string',
				default: '',
				description: 'Last name of the contact',
			},
			{
				displayName: 'Properties',
				name: 'properties',
				type: 'json',
				default: {},
				description: 'Custom properties to merge into the contact',
			},
			{
				displayName: 'Unsubscribed',
				name: 'unsubscribed',
				type: 'boolean',
				default: false,
				description: 'Whether the contact is unsubscribed from all emails',
			},
		],
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['contact'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['contact'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
];

const domainOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['domain'] } },
	options: [
		{ name: 'Create', value: 'create', description: 'Add a domain', action: 'Add a domain' },
		{ name: 'Delete', value: 'delete', description: 'Delete a domain', action: 'Delete a domain' },
		{ name: 'Get', value: 'get', description: 'Get a domain by ID', action: 'Get a domain' },
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'List domains',
			action: 'List domains',
		},
		{
			name: 'Verify',
			value: 'verify',
			description: 'Trigger DNS verification for a domain',
			action: 'Verify a domain',
		},
	],
	default: 'getAll',
};

const domainFields: INodeProperties[] = [
	{
		displayName: 'Domain Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'example.com',
		displayOptions: { show: { resource: ['domain'], operation: ['create'] } },
		description: 'The domain to add, e.g. example.com or send.example.com',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['domain'], operation: ['create'] } },
		options: [
			{
				displayName: 'Region',
				name: 'region',
				type: 'string',
				default: '',
				description:
					'SES region to host the domain in; leave empty for the deployment default',
			},
		],
	},
	{
		displayName: 'Domain ID',
		name: 'domainId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: { resource: ['domain'], operation: ['get', 'verify', 'delete'] },
		},
		description: 'ID of the domain to operate on',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['domain'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['domain'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
];

const broadcastOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['broadcast'] } },
	options: [
		{
			name: 'Cancel',
			value: 'cancel',
			description: 'Cancel a broadcast in progress',
			action: 'Cancel a broadcast',
		},
		{
			name: 'Create',
			value: 'create',
			description: 'Create a broadcast',
			action: 'Create a broadcast',
		},
		{ name: 'Get', value: 'get', description: 'Get a broadcast by ID', action: 'Get a broadcast' },
		{
			name: 'Send',
			value: 'send',
			description: 'Send a draft broadcast',
			action: 'Send a broadcast',
		},
	],
	default: 'create',
};

const broadcastFields: INodeProperties[] = [
	{
		displayName: 'From',
		name: 'from',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Acme <newsletter@yourdomain.com>',
		displayOptions: { show: { resource: ['broadcast'], operation: ['create'] } },
		description: 'Sender address; the domain must be verified for your team',
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['broadcast'], operation: ['create'] } },
		description: 'Subject line of the broadcast',
	},
	{
		displayName: 'HTML',
		name: 'html',
		type: 'string',
		typeOptions: { rows: 5 },
		default: '',
		displayOptions: { show: { resource: ['broadcast'], operation: ['create'] } },
		description: 'HTML body of the broadcast',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['broadcast'], operation: ['create'] } },
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Internal name of the broadcast',
			},
			{
				displayName: 'Preview Text',
				name: 'preview_text',
				type: 'string',
				default: '',
				description: 'Preview text shown by email clients',
			},
			{
				displayName: 'Reply To',
				name: 'reply_to',
				type: 'string',
				default: '',
				description: 'Reply-to address',
			},
			{
				displayName: 'Scheduled At',
				name: 'scheduled_at',
				type: 'string',
				default: '',
				description:
					'Deliver later: ISO 8601 with offset (e.g. 2026-09-01T12:00:00Z) or relative (e.g. "in 2 hours").',
			},
			{
				displayName: 'Segment ID',
				name: 'segment_id',
				type: 'string',
				default: '',
				description: 'Segment (audience) to send the broadcast to',
			},
			{
				displayName: 'Send Immediately',
				name: 'send',
				type: 'boolean',
				default: false,
				description: 'Whether to send the broadcast right after creating it',
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Plain-text body of the broadcast',
			},
			{
				displayName: 'Topic ID',
				name: 'topic_id',
				type: 'string',
				default: '',
				description: 'Topic ID to scope recipients by subscription',
			},
		],
	},
	{
		displayName: 'Broadcast ID',
		name: 'broadcastId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['broadcast'], operation: ['get', 'send', 'cancel'] } },
		description: 'ID of the broadcast to operate on',
	},
	{
		displayName: 'Scheduled At',
		name: 'scheduledAt',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['broadcast'], operation: ['send'] } },
		description:
			'Deliver later: ISO 8601 with offset (e.g. 2026-09-01T12:00:00Z) or relative (e.g. "in 2 hours"); leave empty to send now.',
	},
];

const suppressionOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['suppression'] } },
	options: [
		{
			name: 'Add',
			value: 'add',
			description: 'Add an address to the suppression list',
			action: 'Add a suppression',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'List suppressed addresses',
			action: 'List suppressions',
		},
		{
			name: 'Remove',
			value: 'remove',
			description: 'Remove an address from the suppression list',
			action: 'Remove a suppression',
		},
	],
	default: 'add',
};

const suppressionFields: INodeProperties[] = [
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['suppression'], operation: ['add'] } },
		description: 'Address to suppress (it will no longer receive email)',
	},
	{
		displayName: 'Origin',
		name: 'origin',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['suppression'], operation: ['add'] } },
		description: 'Optional label describing why the address is suppressed',
	},
	{
		displayName: 'Suppression ID or Email',
		name: 'suppressionId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['suppression'], operation: ['remove'] } },
		description: 'ID or email address of the suppression to remove',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['suppression'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: {
			show: { resource: ['suppression'], operation: ['getAll'], returnAll: [false] },
		},
		description: 'Max number of results to return',
	},
];

const usageOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['usage'] } },
	options: [
		{
			name: 'Get',
			value: 'get',
			description: 'Get the plan, limits and usage of the team',
			action: 'Get usage',
		},
	],
	default: 'get',
};

export class MepMail implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MepMail',
		name: 'mepMail',
		icon: { light: 'file:mepmail.svg', dark: 'file:mepmail.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Send email and manage contacts, domains, broadcasts and suppressions with MepMail',
		defaults: { name: 'MepMail' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'mepMailApi', required: true }],
		properties: [
			resourceOptions,
			emailOperations,
			...emailFields,
			contactOperations,
			...contactFields,
			domainOperations,
			...domainFields,
			broadcastOperations,
			...broadcastFields,
			suppressionOperations,
			...suppressionFields,
			usageOperations,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const credentials = (await this.getCredentials('mepMailApi')) as MepMailCredentials;
		const baseUrl = credentials.baseUrl.replace(/\/+$/, '');

		const request = async (
			method: IHttpRequestMethods,
			path: string,
			body?: IDataObject,
			qs?: IDataObject,
		): Promise<IDataObject> => {
			const options: IHttpRequestOptions = {
				method,
				url: `${baseUrl}${path}`,
				json: true,
			};
			if (qs) {
				options.qs = qs;
			}
			if (body) {
				options.body = body;
			}
			return (await this.helpers.httpRequestWithAuthentication.call(
				this,
				'mepMailApi',
				options,
			)) as IDataObject;
		};

		const collectAll = async (
			path: string,
			itemIndex: number,
		): Promise<IDataObject[]> => {
			const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
			const limit = returnAll
				? Number.POSITIVE_INFINITY
				: (this.getNodeParameter('limit', itemIndex, 50) as number);
			const collected: IDataObject[] = [];
			let after: string | undefined;
			for (;;) {
				const qs: IDataObject = { limit: Math.min(100, returnAll ? 100 : limit) };
				if (after) {
					qs.after = after;
				}
				const response = await request('GET', path, undefined, qs);
				const page = (response.data as IDataObject[] | undefined) ?? [];
				collected.push(...page);
				if (collected.length >= limit || !response.has_more) {
					break;
				}
				const lastId = page.length > 0 ? page[page.length - 1].id : undefined;
				if (lastId === undefined || lastId === null) {
					break;
				}
				after = String(lastId);
			}
			return Number.isFinite(limit) ? collected.slice(0, limit) : collected;
		};

		const splitAddresses = (value: unknown): string[] => {
			if (Array.isArray(value)) {
				return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
			}
			return String(value ?? '')
				.split(',')
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0);
		};

		const pushResult = (json: IDataObject, itemIndex: number): void => {
			returnData.push({ json, pairedItem: { item: itemIndex } });
		};

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'email') {
					if (operation === 'send') {
						const from = this.getNodeParameter('from', i) as string;
						const to = splitAddresses(this.getNodeParameter('to', i));
						const subject = this.getNodeParameter('subject', i) as string;
						const html = this.getNodeParameter('html', i) as string;
						const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						const headersCollection = this.getNodeParameter('headers', i, {}) as IDataObject;
						const tagsCollection = this.getNodeParameter('tags', i, {}) as IDataObject;
						const attachmentsCollection = this.getNodeParameter('attachments', i, {}) as IDataObject;

						if (to.length === 0) {
							throw new NodeOperationError(this.getNode(), 'At least one recipient is required in "To"', {
								itemIndex: i,
							});
						}
						if (!html && !additional.text) {
							throw new NodeOperationError(
								this.getNode(),
								'Provide an HTML and/or Text body for the email',
								{ itemIndex: i },
							);
						}

						const body: IDataObject = { from, to, subject };
						if (html) {
							body.html = html;
						}
						if (additional.text) {
							body.text = additional.text;
						}
						const cc = splitAddresses(additional.cc);
						if (cc.length > 0) {
							body.cc = cc;
						}
						const bcc = splitAddresses(additional.bcc);
						if (bcc.length > 0) {
							body.bcc = bcc;
						}
						const replyTo = splitAddresses(additional.reply_to);
						if (replyTo.length > 0) {
							body.reply_to = replyTo.length === 1 ? replyTo[0] : replyTo;
						}
						if (additional.scheduled_at) {
							body.scheduled_at = additional.scheduled_at;
						}
						if (additional.topic_id) {
							body.topic_id = additional.topic_id;
						}

						const headerEntries = (headersCollection.header as IDataObject[] | undefined) ?? [];
						if (headerEntries.length > 0) {
							const headers: IDataObject = {};
							for (const entry of headerEntries) {
								if (entry.name) {
									headers[String(entry.name)] = entry.value ?? '';
								}
							}
							body.headers = headers;
						}

						const tagEntries = (tagsCollection.tag as IDataObject[] | undefined) ?? [];
						if (tagEntries.length > 0) {
							body.tags = tagEntries
								.filter((entry) => entry.name)
								.map((entry) => ({ name: String(entry.name), value: entry.value ?? '' }));
						}

						const attachmentEntries =
							(attachmentsCollection.attachment as IDataObject[] | undefined) ?? [];
						if (attachmentEntries.length > 0) {
							body.attachments = attachmentEntries.map((entry) => {
								const attachment: IDataObject = {
									filename: entry.filename,
									content: entry.content,
								};
								if (entry.content_type) {
									attachment.content_type = entry.content_type;
								}
								return attachment;
							});
						}

						pushResult(await request('POST', '/emails', body), i);
					} else if (operation === 'get') {
						const emailId = this.getNodeParameter('emailId', i) as string;
						pushResult(await request('GET', `/emails/${encodeURIComponent(emailId)}`), i);
					} else if (operation === 'getAll') {
						for (const email of await collectAll('/emails', i)) {
							pushResult(email, i);
						}
					} else if (operation === 'cancel') {
						const emailId = this.getNodeParameter('emailId', i) as string;
						pushResult(
							await request('POST', `/emails/${encodeURIComponent(emailId)}/cancel`),
							i,
						);
					} else if (operation === 'delete') {
						const emailId = this.getNodeParameter('emailId', i) as string;
						pushResult(await request('DELETE', `/emails/${encodeURIComponent(emailId)}`), i);
					}
				} else if (resource === 'contact') {
					if (operation === 'create') {
						const email = this.getNodeParameter('email', i) as string;
						const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						const body: IDataObject = { email };
						if (additional.first_name) {
							body.first_name = additional.first_name;
						}
						if (additional.last_name) {
							body.last_name = additional.last_name;
						}
						if (additional.properties !== undefined) {
							body.properties = additional.properties;
						}
						if (additional.unsubscribed !== undefined) {
							body.unsubscribed = additional.unsubscribed;
						}
						pushResult(await request('POST', '/contacts', body), i);
					} else if (operation === 'get') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						pushResult(
							await request('GET', `/contacts/${encodeURIComponent(contactId)}`),
							i,
						);
					} else if (operation === 'getAll') {
						for (const contact of await collectAll('/contacts', i)) {
							pushResult(contact, i);
						}
					} else if (operation === 'update') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						const updateFields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
						const body: IDataObject = {};
						if (updateFields.first_name !== undefined) {
							body.first_name = updateFields.first_name;
						}
						if (updateFields.last_name !== undefined) {
							body.last_name = updateFields.last_name;
						}
						if (updateFields.properties !== undefined) {
							body.properties = updateFields.properties;
						}
						if (updateFields.unsubscribed !== undefined) {
							body.unsubscribed = updateFields.unsubscribed;
						}
						if (Object.keys(body).length === 0) {
							throw new NodeOperationError(
								this.getNode(),
								'Provide at least one field to update',
								{ itemIndex: i },
							);
						}
						pushResult(
							await request('PATCH', `/contacts/${encodeURIComponent(contactId)}`, body),
							i,
						);
					} else if (operation === 'delete') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						pushResult(
							await request('DELETE', `/contacts/${encodeURIComponent(contactId)}`),
							i,
						);
					}
				} else if (resource === 'domain') {
					if (operation === 'create') {
						const name = this.getNodeParameter('name', i) as string;
						const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						const body: IDataObject = { name };
						if (additional.region) {
							body.region = additional.region;
						}
						pushResult(await request('POST', '/domains', body), i);
					} else if (operation === 'get') {
						const domainId = this.getNodeParameter('domainId', i) as string;
						pushResult(await request('GET', `/domains/${encodeURIComponent(domainId)}`), i);
					} else if (operation === 'getAll') {
						for (const domain of await collectAll('/domains', i)) {
							pushResult(domain, i);
						}
					} else if (operation === 'verify') {
						const domainId = this.getNodeParameter('domainId', i) as string;
						pushResult(
							await request('POST', `/domains/${encodeURIComponent(domainId)}/verify`),
							i,
						);
					} else if (operation === 'delete') {
						const domainId = this.getNodeParameter('domainId', i) as string;
						pushResult(await request('DELETE', `/domains/${encodeURIComponent(domainId)}`), i);
					}
				} else if (resource === 'broadcast') {
					if (operation === 'create') {
						const from = this.getNodeParameter('from', i) as string;
						const subject = this.getNodeParameter('subject', i) as string;
						const html = this.getNodeParameter('html', i) as string;
						const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						const body: IDataObject = { from, subject };
						if (html) {
							body.html = html;
						}
						for (const key of [
							'name',
							'preview_text',
							'reply_to',
							'scheduled_at',
							'segment_id',
							'text',
							'topic_id',
						]) {
							if (additional[key]) {
								body[key] = additional[key];
							}
						}
						if (additional.send !== undefined) {
							body.send = additional.send;
						}
						pushResult(await request('POST', '/broadcasts', body), i);
					} else if (operation === 'get') {
						const broadcastId = this.getNodeParameter('broadcastId', i) as string;
						pushResult(
							await request('GET', `/broadcasts/${encodeURIComponent(broadcastId)}`),
							i,
						);
					} else if (operation === 'send') {
						const broadcastId = this.getNodeParameter('broadcastId', i) as string;
						const scheduledAt = this.getNodeParameter('scheduledAt', i, '') as string;
						const body: IDataObject = {};
						if (scheduledAt) {
							body.scheduled_at = scheduledAt;
						}
						pushResult(
							await request(
								'POST',
								`/broadcasts/${encodeURIComponent(broadcastId)}/send`,
								body,
							),
							i,
						);
					} else if (operation === 'cancel') {
						const broadcastId = this.getNodeParameter('broadcastId', i) as string;
						pushResult(
							await request('POST', `/broadcasts/${encodeURIComponent(broadcastId)}/cancel`),
							i,
						);
					}
				} else if (resource === 'suppression') {
					if (operation === 'add') {
						const email = this.getNodeParameter('email', i) as string;
						const origin = this.getNodeParameter('origin', i, '') as string;
						const body: IDataObject = { email };
						if (origin) {
							body.origin = origin;
						}
						pushResult(await request('POST', '/suppressions', body), i);
					} else if (operation === 'getAll') {
						for (const suppression of await collectAll('/suppressions', i)) {
							pushResult(suppression, i);
						}
					} else if (operation === 'remove') {
						const suppressionId = this.getNodeParameter('suppressionId', i) as string;
						pushResult(
							await request('DELETE', `/suppressions/${encodeURIComponent(suppressionId)}`),
							i,
						);
					}
				} else if (resource === 'usage') {
					pushResult(await request('GET', '/usage'), i);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported resource: ${resource}`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				const wrapped =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
				if (wrapped instanceof NodeOperationError && !wrapped.context) {
					wrapped.context = { itemIndex: i };
				}
				throw wrapped;
			}
		}

		return [returnData];
	}
}
