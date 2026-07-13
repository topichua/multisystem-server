# Order Status Automations (V1)

## Tables

- `order_status_automations` — rule definitions (workspace-scoped, soft-deleted)
- `order_status_automation_executions` — APPLIED / SKIPPED / FAILED audit log with idempotency key
- `orders.payment_status_at` — when current `payment_status` was entered
- `order_delivery_infos.delivery_status_at` — when current `delivery_status` was entered

## Lifecycle: immediate rule

1. Delivery or payment status changes through a centralized application service
2. If value actually changed, timestamp is updated (`*StatusAt`)
3. `OrderStatusAutomationTriggerService` loads active rules for workspace + source type + source status
4. Rules with `duration_value IS NULL` are evaluated immediately via `OrderStatusAutomationExecutorService`
5. Rules with duration are not executed immediately
6. Executor re-validates conditions and applies `OrderStatusTransitionService.changeOrderStatus` with `source: AUTOMATION`

## Lifecycle: timed rule

1. No per-rule delayed jobs are created
2. `NovaPoshtaDeliverySyncWorkerService` runs hourly and syncs Nova Poshta deliveries with TTN + phone
3. After sync, it asks the automation executor to evaluate due DELIVERY_STATUS timed rules
4. Execution checks: automation active, status unchanged, timestamp unchanged, time elapsed
5. Stale candidates end as SKIPPED (`SOURCE_STATUS_CHANGED`, `STALE_STATUS_TIMESTAMP`, etc.)

## Integration points

| Event | Service |
|-------|---------|
| Nova Poshta sync / simulator | `DeliveryStatusService` → `OrderDeliveryStatusApplicationService` |
| Manual delivery PATCH | `OrdersService.updateDeliveryInfo` → application service |
| TTN removal | `NovaPoshtaWaybillService` → application service |
| Payment webhook / sync / manual | `PaymentDomainService` → `OrderPaymentStatusApplicationService` |
| Hourly Nova Poshta sync | `NovaPoshtaDeliverySyncWorkerService` |

## Idempotency

Unique constraint on `(automation_id, order_id, idempotency_key)` in executions table.

Key format: `{sourceType}:{sourceStatus}:{immediate\|timed}:{statusChangedAt ISO}`

## Default templates

Created inactive on workspace registration (`origin = MULTISALE_TEMPLATE`):

- `delivery.delivered_to_completed`
- `delivery.returned_to_returned`
- `payment.paid_to_confirmed`

## Adding a new internal status

1. Add enum value to `OrderDeliveryStatus` or `OrderPaymentStatus` (+ migration if PostgreSQL enum)
2. Automations accept the new code via `sourceStatus` validation in `automation-source-status.logic.ts`
3. Ensure status changes go through the centralized application services

## Future action types

Add enum value to `AutomationActionType`, branch in executor `applyAutomation`, keep V1 columns — no JSON rule builder required.
