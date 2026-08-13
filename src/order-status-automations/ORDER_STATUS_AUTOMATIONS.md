# Order Status Automations (V1)

## Tables

- `order_status_automations` — rule definitions (workspace-scoped, soft-deleted)
- `order_status_automation_executions` — APPLIED / SKIPPED / FAILED audit log with idempotency key
- `order_status_automation_scheduled_jobs` — deferred SEND_MESSAGE queue (PENDING → SENT / CANCELLED / FAILED)
- `orders.payment_status_at` — when current `payment_status` was entered
- `order_delivery_infos.delivery_status_at` — when current `delivery_status` was entered
- `orders.status_changed_at` — when current order `status_id` was entered (`ORDER_STATUS` conditions)

## Rule builder criteria

`GET /automation_rule/criteria` returns `delivery`, `payment`, `statuses`, `conversationGroups`, and `orderTemplates`.
- Use delivery/payment `id` as `conditions[].sourceStatus` with the matching `sourceType` (`DELIVERY_STATUS` or `PAYMENT_STATUS`).
- Use `statuses[].id` as `targetOrderStatusId` (automation action `CHANGE_ORDER_STATUS`), **or** as `conditions[].sourceStatus` (string) with `sourceType: ORDER_STATUS`.
- Use `conversationGroups[].id` as `targetConversationGroupId` with `actionType: CHANGE_CONVERSATION_GROUP`.
- Use `orderTemplates[].id` as `targetTemplateId` with `actionType: SEND_MESSAGE` (order templates only).

## Rule shape

- `conditions[]` — OR/AND trigger conditions (`sourceType` + `sourceStatus`, optional `operator` EQ/NEQ, optional `durationValue` + `durationUnit` per condition)
- **Actions**
  - `CHANGE_ORDER_STATUS` + `targetOrderStatusId`
  - `CHANGE_CONVERSATION_GROUP` + `targetConversationGroupId` (moves the **order-linked** conversation)
  - `SEND_MESSAGE` + `targetTemplateId` (+ optional action delay / business hours)

### SEND_MESSAGE example

When payment becomes paid → wait 2 hours → only during work schedule → send order template:

```json
{
  "name": "Thanks after payment",
  "conditionType": "AND",
  "conditions": [
    {
      "sourceType": "PAYMENT_STATUS",
      "sourceStatus": "paid",
      "operator": "EQ"
    }
  ],
  "actionType": "SEND_MESSAGE",
  "targetTemplateId": 7,
  "actionDelayValue": 2,
  "actionDelayUnit": "HOURS",
  "waitForBusinessHours": true
}
```

Rules:

1. Order must have a linked `conversationId` (else SKIP `ORDER_HAS_NO_CONVERSATION`)
2. Template must be workspace `type=order`
3. Message is rendered at send time (variables from current order)
4. Sent as workspace owner via Instagram/Telegram conversation messaging
5. `actionDelayValue` + `actionDelayUnit` optional (`MINUTES` | `HOURS` | `DAYS`); omit both = no delay
6. `waitForBusinessHours: true` snaps send time to workspace work schedule (`GET/PATCH /workspace/settings`)
7. At send time all rule conditions are re-checked; if they no longer match → CANCELLED + SKIPPED `CONDITIONS_NOT_MATCHED`

## Scheduled + history APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /automation_rule/scheduled?status=PENDING&automationId=` | Upcoming deferred SEND_MESSAGE jobs |
| `GET /automation_rule/history?status=&automationId=&orderId=` | APPLIED / SKIPPED / FAILED for **all** action types |

Default scheduled filter is `PENDING`. History is newest-first.

## Lifecycle: immediate rule

1. Delivery, payment, or **order** status changes through a centralized application service
2. If value actually changed, timestamp is updated (`*StatusAt` / `status_changed_at`)
3. `OrderStatusAutomationTriggerService` loads active rules whose **conditions** include the changed source type + status (EQ match or NEQ match)
4. Conditions with `duration_value IS NULL` are evaluated immediately via `OrderStatusAutomationExecutorService`
5. Conditions with duration are not executed immediately
6. Executor re-validates conditions and applies the action:
   - `CHANGE_ORDER_STATUS` → `OrderStatusTransitionService` with `source: AUTOMATION`
   - `CHANGE_CONVERSATION_GROUP` → conversation workflow (latest-order rules)
   - `SEND_MESSAGE` → schedule or send now
7. Order status changes with `source: AUTOMATION` do **not** re-fire `ORDER_STATUS` immediate rules (loop protection)

## Lifecycle: timed condition rule

1. No per-rule delayed jobs are created for condition duration
2. `NovaPoshtaDeliverySyncWorkerService` runs hourly and syncs Nova Poshta deliveries with TTN + phone
3. After sync, it asks the automation executor to evaluate due DELIVERY_STATUS, PAYMENT_STATUS, and ORDER_STATUS timed rules
4. Execution checks: automation active, status unchanged, timestamp unchanged, time elapsed
5. Stale candidates end as SKIPPED (`SOURCE_STATUS_CHANGED`, `STALE_STATUS_TIMESTAMP`, etc.)

## Lifecycle: SEND_MESSAGE delay / business hours

1. After conditions match, compute `runAt = now + actionDelay` (if any)
2. If `waitForBusinessHours`, snap `runAt` via workspace work schedule
3. If `runAt` is essentially now → send immediately
4. Else insert `PENDING` row in `order_status_automation_scheduled_jobs`
5. `AutomationSendMessageWorkerService` polls due jobs (default every 15s)
6. On due: re-check automation active + conditions + business hours → render → send → `SENT` + execution `APPLIED`

Env knobs:

- `AUTOMATION_SEND_MESSAGE_WORKER_ENABLED` (default on)
- `AUTOMATION_SEND_MESSAGE_WORKER_INTERVAL_MS` (default `15000`)
- `AUTOMATION_SEND_MESSAGE_WORKER_BATCH_SIZE` (default `50`)

## Integration points

| Event | Service |
|-------|---------|
| Nova Poshta sync / simulator | `DeliveryStatusService` → `OrderDeliveryStatusApplicationService` |
| Manual delivery status change | `PATCH /orders/:orderId/delivery/status` → `DeliveryStatusService.changeDeliveryStatusForOrder` |
| Manual delivery PATCH | `OrdersService.updateDeliveryInfo` → application service |
| TTN removal | `NovaPoshtaWaybillService` → application service |
| Payment webhook / sync / manual | `PaymentDomainService` → `OrderPaymentStatusApplicationService` |
| Order status change (manual/confirm) | `OrderStatusTransitionService` → `ORDER_STATUS` trigger (not for AUTOMATION) |
| Hourly Nova Poshta sync | `NovaPoshtaDeliverySyncWorkerService` |
| Deferred SEND_MESSAGE | `AutomationSendMessageWorkerService` |

## Idempotency

Unique constraint on `(automation_id, order_id, idempotency_key)` in executions **and** scheduled jobs.

Key format: `{sourceType}:{sourceStatus}:{immediate\|timed}:{statusChangedAt ISO}`

## Default templates

Created inactive on workspace registration (`origin = MULTISALE_TEMPLATE`):

- `delivery.delivered_to_completed`
- `payment.paid_to_confirmed`

## Adding a new internal status

1. Add enum value to `OrderDeliveryStatus` or `OrderPaymentStatus` (+ migration if PostgreSQL enum)
2. Automations accept the new code via `sourceStatus` validation in `automation-source-status.logic.ts`
3. Ensure status changes go through the centralized application services

## Adding a new action type

Add enum value to `AutomationActionType`, branch in executor `applyAutomation`, migration for any new columns.
