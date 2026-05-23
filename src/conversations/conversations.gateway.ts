import {
  Logger,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { IsInt, Min } from "class-validator";
import type { Server, Socket } from "socket.io";
import { Repository } from "typeorm";
import { ROLE_SUPER_ADMIN } from "../auth/constants";
import type { JwtPayload } from "../auth/interfaces/jwt-payload.interface";
import { Conversation } from "../database/entities";
import { ConversationsRealtimeService } from "./conversations-realtime.service";

class SubscribeConversationDto {
  @IsInt()
  @Min(1)
  conversationId: number;
}

type AuthedSocket = Socket & { data: { ownerId: number } };

@WebSocketGateway({
  namespace: "/conversations",
  cors: { origin: true, credentials: true },
})
export class ConversationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly log = new Logger(ConversationsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly realtime: ConversationsRealtimeService,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
  ) {}

  afterInit(server: Server): void {
    this.realtime.bindServer(server);
    this.log.log("WebSocket namespace /conversations ready");
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const ownerId = this.resolveOwnerIdFromHandshake(client);
      client.data.ownerId = ownerId;
      await client.join(this.realtime.ownerRoom(ownerId));
      this.log.debug(`WS connected ownerId=${ownerId} id=${client.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unauthorized";
      this.log.warn(`WS connection rejected: ${msg}`);
      client.emit("error", { message: msg });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    this.log.debug(
      `WS disconnected ownerId=${client.data?.ownerId ?? "?"} id=${client.id}`,
    );
  }

  @SubscribeMessage("subscribe")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async subscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: SubscribeConversationDto,
  ): Promise<{ ok: true; conversationId: number }> {
    const ownerId = client.data.ownerId;
    const conv = await this.conversationRepo.findOne({
      where: { id: body.conversationId, managerId: ownerId },
    });
    if (!conv) {
      throw new UnauthorizedException("Conversation not found");
    }
    await client.join(this.realtime.conversationRoom(conv.id));
    return { ok: true, conversationId: conv.id };
  }

  @SubscribeMessage("unsubscribe")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async unsubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: SubscribeConversationDto,
  ): Promise<{ ok: true; conversationId: number }> {
    await client.leave(this.realtime.conversationRoom(body.conversationId));
    return { ok: true, conversationId: body.conversationId };
  }

  private resolveOwnerIdFromHandshake(client: Socket): number {
    const auth = client.handshake.auth as { token?: unknown };
    const query = client.handshake.query as { jwt?: unknown; token?: unknown };
    const raw =
      (typeof auth?.token === "string" ? auth.token : undefined) ??
      (typeof query?.jwt === "string" ? query.jwt : undefined) ??
      (typeof query?.token === "string" ? query.token : undefined);
    const token = raw?.trim();
    if (!token) {
      throw new UnauthorizedException(
        "Missing JWT: pass handshake.auth.token or query jwt",
      );
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired JWT");
    }

    if (payload.role !== ROLE_SUPER_ADMIN) {
      throw new UnauthorizedException("Invalid role for WebSocket");
    }

    const ownerId = Number.parseInt(payload.sub, 10);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new UnauthorizedException("JWT subject must be a numeric user id");
    }
    return ownerId;
  }
}
