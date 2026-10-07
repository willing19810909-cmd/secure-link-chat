import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from '../auth/auth.module';
import { MessageModule } from '../message/message.module';
import { GroupModule } from '../group/group.module';

@Module({
  imports: [AuthModule, MessageModule, GroupModule],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class ChatModule {}
