# Appurdex JS SDK

TypeScript client for the Appurdex source-backed API.

```ts
import { AppurdexClient } from "@appurdex/sdk";

const client = new AppurdexClient({ apiKey: process.env.APPURDEX_API_KEY });
const agents = await client.agents.list();
const research = await client.search.research("free tools with multi-model support");
```

Free API keys can call snapshot endpoints with the configured 500 requests/month default. Starter, Pro, and Enterprise methods return the API error from the server when the key does not have access.