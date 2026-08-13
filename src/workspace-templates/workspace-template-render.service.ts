import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Client,
  ClientLink,
  ClientLinkProvider,
  Conversation,
  ConversationSource,
  Order,
  OrderDeliveryInfo,
} from "../database/entities";
import { WorkspaceTemplate } from "./workspace-template.entity";
import { WorkspaceTemplateType } from "./workspace-template-type.enum";
import {
  getTemplateVariablesForType,
  renderTemplateText,
} from "./logic/template-variables.logic";

@Injectable()
export class WorkspaceTemplateRenderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderDeliveryInfo)
    private readonly deliveryRepo: Repository<OrderDeliveryInfo>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(ClientLink)
    private readonly clientLinkRepo: Repository<ClientLink>,
  ) {}

  async render(input: {
    template: WorkspaceTemplate;
    workspaceId: number;
    orderId?: number;
    conversationId?: number;
  }): Promise<{ text: string; variables: Record<string, string> }> {
    const { template, workspaceId } = input;

    if (template.type === WorkspaceTemplateType.order) {
      if (input.orderId == null) {
        throw new BadRequestException(
          "orderId is required to render an order template",
        );
      }
      const variables = await this.buildOrderVariables(
        workspaceId,
        input.orderId,
      );
      return {
        text: renderTemplateText(template.template, variables),
        variables,
      };
    }

    if (input.conversationId == null) {
      throw new BadRequestException(
        "conversationId is required to render a chat template",
      );
    }
    const variables = await this.buildChatVariables(
      workspaceId,
      input.conversationId,
    );
    return {
      text: renderTemplateText(template.template, variables),
      variables,
    };
  }

  private async buildChatVariables(
    workspaceId: number,
    conversationId: number,
  ): Promise<Record<string, string>> {
    const conversation = await this.conversationRepo.findOne({
      where: { workspaceId, id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const client = await this.resolveClientForConversation(
      workspaceId,
      conversation,
    );
    const keys = getTemplateVariablesForType(WorkspaceTemplateType.chat).map(
      (v) => v.key,
    );
    const values: Record<string, string> = {
      "client.name": client?.firstName?.trim() ?? "",
      "client.lastName": client?.lastName?.trim() ?? "",
      "client.phoneNumber": client?.phone?.trim() ?? "",
    };
    return pickKeys(keys, values);
  }

  private async buildOrderVariables(
    workspaceId: number,
    orderId: number,
  ): Promise<Record<string, string>> {
    const order = await this.orderRepo.findOne({
      where: { workspaceId, id: orderId },
      relations: { status: true, customer: true },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    let delivery: OrderDeliveryInfo | null = null;
    if (order.deliveryId != null) {
      delivery = await this.deliveryRepo.findOne({
        where: { id: order.deliveryId },
      });
    }

    const client = order.customer;
    const keys = getTemplateVariablesForType(WorkspaceTemplateType.order).map(
      (v) => v.key,
    );
    const values: Record<string, string> = {
      "client.name": client?.firstName?.trim() ?? "",
      "client.lastName": client?.lastName?.trim() ?? "",
      "client.phone": client?.phone?.trim() ?? "",
      "order.status": order.status?.name?.trim() ?? "",
      "order.ttn": delivery?.trackingNumber?.trim() ?? "",
      "order.delivery_status": delivery?.deliveryStatus ?? "",
      "order.payment_status": order.paymentStatus ?? "",
    };
    return pickKeys(keys, values);
  }

  private async resolveClientForConversation(
    workspaceId: number,
    conversation: Conversation,
  ): Promise<Client | null> {
    const provider = conversationSourceToLinkProvider(conversation.source);
    if (provider == null) {
      return null;
    }
    const link = await this.clientLinkRepo.findOne({
      where: {
        workspaceId,
        provider,
        externalId: conversation.participantId,
      },
    });
    if (!link) {
      return null;
    }
    return this.clientRepo.findOne({
      where: { id: link.clientId, workspaceId },
    });
  }
}

function conversationSourceToLinkProvider(
  source: ConversationSource,
): ClientLinkProvider | null {
  if (source === ConversationSource.INSTAGRAM) {
    return ClientLinkProvider.INSTAGRAM;
  }
  if (source === ConversationSource.TELEGRAM) {
    return ClientLinkProvider.TELEGRAM;
  }
  return null;
}

function pickKeys(
  keys: string[],
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    out[key] = values[key] ?? "";
  }
  return out;
}
