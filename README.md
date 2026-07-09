<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

NestJS backend for MultiSale.

## MonoPay / Monobank acquiring (billing)

This project integrates **Mono Acquiring API** (legacy merchant API), **not** OAuth Checkout API.

| Credential | Where to get it | Works for billing? |
|------------|-----------------|-------------------|
| **Personal API token** | [api.monobank.ua/index.html](https://api.monobank.ua/index.html) | **No** — personal banking API only |
| **Merchant X-Token** | [web.monobank.ua](https://web.monobank.ua/) → Інтернет → Еквайринг → Токен | **Yes** |
| **OAuth client_id/secret** | Mono Business Checkout | **Not implemented** in this server |

### API used

- Base URL: `https://api.monobank.ua`
- Auth header: `X-Token: <merchant_token>`
- `POST /api/merchant/invoice/create` — create payment page
- `GET /api/merchant/invoice/status?invoiceId=...` — poll status
- `GET /api/merchant/pubkey` — webhook signature verification
- Webhook: `POST /webhooks/monopay` with `X-Sign` (ECDSA)

### Environment variables

```env
MONOPAY_MERCHANT_TOKEN=...   # from web.monobank.ua acquiring
PUBLIC_API_URL=https://your-api.example.com
APP_URL=https://your-app.example.com
MONOPAY_WEBHOOK_URL=https://your-api.example.com/webhooks/monopay  # optional
MONOPAY_REDIRECT_URL=https://your-app.example.com/billing/payment/result  # optional
```

Aliases: `MONOPAY_TOKEN`, `MONOBANK_MERCHANT_TOKEN`, `MONOBANK_TOKEN` (lower priority).

**Do not use** Personal API token from api.monobank.ua — you will get HTTP 401/403 on `/api/merchant/*`.

### Test real 1 UAH payment

1. Configure env and run server with public HTTPS webhook (Railway/ngrok).

2. Check config:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$API/billing/monopay/config-check"
```

Expect `ok: true`, `integration.api: "acquiring"`, `apiTest.ok: true`.

3. Create 1 UAH test invoice (dev only):

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "$API/billing/monopay/test-invoice"
```

Open `paymentUrl`, pay with card.

4. Poll status if webhook missed:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$API/billing/monopay/test-invoice/p2_xxx/status"
```

### Full subscription flow

```
POST /workspace/billing/subscription/change
POST /workspace/billing/invoices/:id/pay     → paymentUrl
[pay on MonoPay]
POST /webhooks/monopay                       → auto (or sync-payment manually)
GET  /workspace/billing/entitlements
```

### Debug logging

Server logs (without full tokens):

- MonoPay base URL, endpoint, masked token (`abcd…wxyz`)
- Request/response for create/status
- Webhook payload: invoiceId, status, amount, reference
- Clear hint on 401/403 if wrong token type

Dev endpoints require `NODE_ENV !== production` or `ENABLE_DEV_BILLING_SIMULATOR=true`.

---

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
