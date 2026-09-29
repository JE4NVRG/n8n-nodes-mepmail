import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MepMailApi implements ICredentialType {
	name = 'mepMailApi';

	displayName = 'MepMail API';

	icon: Icon = { light: 'file:../icons/mepmail.svg', dark: 'file:../icons/mepmail.dark.svg' };

	documentationUrl = 'https://docs-mepmail.je4ndev.com/api-reference';

	properties: INodeProperties[] = [
		{
			displayName: 'API Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api-mepmail.je4ndev.com',
			description:
				'Base URL of the MepMail API — the cloud default, or your self-hosted instance origin',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Create an API key in your MepMail dashboard (Settings → API Keys). A full access key unlocks every operation.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials?.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/domains',
			method: 'GET',
		},
	};
}
