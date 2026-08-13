# Order Status Automations (V1)

## Tables

- `order_status_automations` — rule definitions (workspace-scoped, soft-deleted)
- `order_status_automation_executions` — APPLIED / SKIPPED / FAILED audit log with idempotency key
- `orders.payment_status_at` — when current `payment_status` was entered
- `order_delivery_infos.delivery_status_at` — when current `delivery_status` was entered
- `orders.status_changed_at` — when current order `status_id` was entered (`ORDER_STATUS` conditions)

## Rule builder criteria

`GET /automation_rule/criteria` returns `delivery`, `payment`, and `statuses` arrays of `{ id, name }`.
- Use delivery/payment `id` as `conditions[].sourceStatus` with the matching `sourceType` (`DELIVERY_STATUS` or `PAYMENT_STATUS`).
- Use `statuses[].id` as `targetOrderStatusId` (automation action `CHANGE_ORDER_STATUS`), **or** as `conditions[].sourceStatus` (string) with `sourceType: ORDER_STATUS`.
- Use `conversationGroups[].id` as `targetConversationGroupId` with `actionType: CHANGE_CONVERSATION_GROUP`.

## Rule shape

- `conditions[]` — OR/AND trigger conditions (`sourceType` + `sourceStatus`, optional `operator` EQ/NEQ, optional `durationValue` + `durationUnit` per condition)
- **Actions**
  - `CHANGE_ORDER_STATUS` + `targetOrderStatusId`
  - `CHANGE_CONVERSATION_GROUP` + `targetConversationGroupId` (moves the **order-linked** conversation)

Example: when order reaches completed status → archive chat:

```json
{
  "name": "Archive chat when order completed",
  "conditions": [
    {
      "sourceType": "ORDER_STATUS",
      "sourceStatus": "12",
      "operator": "EQ"
    }
  ],
  "actionType": "CHANGE_CONVERSATION_GROUP",
  "targetConversationGroupId": 5
}
```

**`CHANGE_CONVERSATION_GROUP` always uses the conversation’s latest order:**

1. Resolve `order.conversationId`
2. Find last order for that chat (`created_at DESC`, then `id DESC`)
3. If the triggering order is **not** that last order → SKIP `NOT_LAST_ORDER_FOR_CONVERSATION`
4. Re-check **all** rule conditions against that last order (so `ORDER_STATUS` + `PAYMENT_STATUS` = status and payment of the **last** order)
5. If the order has no `conversationId` → SKIP `ORDER_HAS_NO_CONVERSATION`

Recommended pattern for archiving (status **and** payment of last order):

```json
{
  "name": "Archive when last order completed and paid",
  "conditionType": "AND",
  "conditions": [
    {
      "sourceType": "ORDER_STATUS",
      "sourceStatus": "12",
      "operator": "EQ"
    },
    {
      "sourceType": "PAYMENT_STATUS",
      "sourceStatus": "paid",
      "operator": "EQ"
    }
  ],
  "actionType": "CHANGE_CONVERSATION_GROUP",
  "targetConversationGroupId": 5
}
```

If the order has no `conversationId`, execution is SKIPPED (`ORDER_HAS_NO_CONVERSATION`).

Example: when order status is **not** 29 (immediate) → move order to another status:

```json
{
  "name": "Not status 29",
  "conditions": [
    {
      "sourceType": "ORDER_STATUS",
      "sourceStatus": "29",
      "operator": "NEQ"
    }
  ],
  "targetOrderStatusId": 12
}
```

Example: when delivery is `at_branch` for more than 3 days → move order to `completed`:

```json
{
  "name": "At branch more than 3 days",
  "conditions": [
    {
      "sourceType": "DELIVERY_STATUS",
      "sourceStatus": "at_branch",
      "durationValue": 3,
      "durationUnit": "DAYS"
    }
  ],
  "targetOrderStatusId": 12
}
```

Example: when delivery is `at_branch` **OR** `delivered` (immediate) → move order to `completed`.

## Lifecycle: immediate rule

1. Delivery, payment, or **order** status changes through a centralized application service
2. If value actually changed, timestamp is updated (`*StatusAt` / `status_changed_at`)
3. `OrderStatusAutomationTriggerService` loads active rules whose **conditions** include the changed source type + status (EQ match or NEQ match)
4. Conditions with `duration_value IS NULL` are evaluated immediately via `OrderStatusAutomationExecutorService`
5. Conditions with duration are not executed immediately
6. Executor re-validates conditions and applies `OrderStatusTransitionService.changeOrderStatus` with `source: AUTOMATION`
7. Order status changes with `source: AUTOMATION` do **not** re-fire `ORDER_STATUS` immediate rules (loop protection)

## Lifecycle: timed rule

1. No per-rule delayed jobs are created
2. `NovaPoshtaDeliverySyncWorkerService` runs hourly and syncs Nova Poshta deliveries with TTN + phone
3. After sync, it asks the automation executor to evaluate due DELIVERY_STATUS, PAYMENT_STATUS, and ORDER_STATUS timed rules
4. Execution checks: automation active, status unchanged, timestamp unchanged, time elapsed
5. Stale candidates end as SKIPPED (`SOURCE_STATUS_CHANGED`, `STALE_STATUS_TIMESTAMP`, etc.)

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

## Idempotency

Unique constraint on `(automation_id, order_id, idempotency_key)` in executions table.

Key format: `{sourceType}:{sourceStatus}:{immediate\|timed}:{statusChangedAt ISO}`

## Default templates

Created inactive on workspace registration (`origin = MULTISALE_TEMPLATE`):

- `delivery.delivered_to_completed`
- `payment.paid_to_confirmed`

## Adding a new internal status

1. Add enum value to `OrderDeliveryStatus` or `OrderPaymentStatus` (+ migration if PostgreSQL enum)
2. Automations accept the new code via `sourceStatus` validation in `automation-source-status.logic.ts`
3. Ensure status changes go through the centralized application services

## Future action types

Add enum value to `AutomationActionType`, branch in executor `applyAutomation`, keep V1 columns — no JSON rule builder required.
