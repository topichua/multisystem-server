import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConversationGroup } from "../database/entities";
import { ConversationGroupDefaultsService } from "./conversation-group-defaults.service";

/** Minimal module so workspace/auth bootstrap can seed system groups without importing full conversations stack. */
@Module({
  imports: [TypeOrmModule.forFeature([ConversationGroup])],
  providers: [ConversationGroupDefaultsService],
  exports: [ConversationGroupDefaultsService],
})
export class ConversationGroupDefaultsModule {}
