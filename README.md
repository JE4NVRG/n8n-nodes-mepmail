# n8n-nodes-mepmail

[n8n](https://n8n.io) community nodes for **MepMail** — the email platform that is
wire-compatible with Resend and can run as a service ([mepmail.je4ndev.com](https://mepmail.je4ndev.com))
or self-hosted on your own infrastructure.

## Installation

**n8n (self-hosted) / community nodes**

Settings → Community Nodes → Install → package name:

```
n8n-nodes-mepmail
```

or via npm in the n8n environment:

```bash
npm install n8n-nodes-mepmail
```

## Credentials

Create an **API key** in your MepMail dashboard and fill in:

| Field | Description |
| --- | --- |
| API Base URL | `https://api-mepmail.je4ndev.com` (cloud) or your self-hosted instance origin |
| API Key | Bearer key created in the dashboard; use a full access key to unlock every operation |

A **sending only** key works only for `Email → Send`; every other operation
requires a full access key.

## Operations

| Resource | Operations |
| --- | --- |
| **Broadcast** | Cancel, Create, Get, Send |
| **Contact** | Create, Delete, Get, Update, Get Many |
| **Domain** | Create, Delete, Get, Verify, Get Many |
| **Email** | Send (HTML and/or Text, CC/BCC/Reply-To, headers, tags, base64 attachments, scheduled sends), Get, Get Many, Cancel, Delete |
| **Suppression** | Add, Remove, Get Many |
| **Usage** | Get plan, limits and current usage |

## MepMail Trigger

Starts a workflow when MepMail sends a webhook event — `email.delivered`,
`email.bounced`, `email.opened`, `email.clicked`, `contact.created`,
`quota.reached` and more (22 event types).

Add the node, select the events, and activate the workflow: the trigger
registers, updates and removes the webhook subscription in MepMail
automatically. Incoming payloads are verified with the subscription's signing
secret out of the box (Standard Webhooks / Svix compatible HMAC-SHA256); paste
a `whsec_...` into the node only to override it. Requires a full access API key.

## Compatibility

Every endpoint follows the Resend wire format, so request/response shapes match
the official Resend SDKs. Send attachments as inline base64 `content`
(remote URLs are rejected). See the
[API reference](https://docs-mepmail.je4ndev.com/api-reference) for the full
surface and the few deliberate differences.

## Development

```bash
npm install
npm run build   # compile TypeScript + copy icons into dist/
npm run lint    # n8n community node lint rules
npm run dev     # run a local n8n with these nodes loaded (hot reload)
```

## License

[MIT](LICENSE.md)
