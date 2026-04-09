import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from './entities/user.entity';
import { InvitationTokenService } from './crypto/invitation-token.service';
import { PasswordService } from './crypto/password.service';
import { UsersAdminController } from './users-admin.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [UsersAdminController],
  providers: [UsersService, PasswordService, InvitationTokenService],
  exports: [TypeOrmModule, UsersService, PasswordService],
})
export class UsersModule {}
