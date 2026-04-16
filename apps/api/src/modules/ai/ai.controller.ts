import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser, JwtPayloadUser } from '../auth/decorators/current-user.decorator';
import { AiService } from './ai.service';
import { AiChatService } from './ai-chat.service';
import { ChatRequestDto, ConfirmWriteDto } from './dto/chat.dto';
import { FinancialInsightsDto } from './dto/financial-insights.dto';

@ApiTags('ai')
@Controller('ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiChatService: AiChatService,
  ) {}

  @Post('insights')
  @Permissions('reports:read')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get AI-powered financial insights' })
  @ApiResponse({ status: 200, description: 'AI insights generated successfully' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getInsights(@Body() body: FinancialInsightsDto) {
    const text = await this.aiService.getFinancialInsights(body.metrics);
    return { insights: text };
  }

  @Post('chat')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Conversational AI chat with function calling' })
  @ApiResponse({ status: 200, description: 'Chat response generated' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async chat(@Body() body: ChatRequestDto, @CurrentUser() user: JwtPayloadUser) {
    return this.aiChatService.chat(
      body.message,
      body.history ?? [],
      { userId: user.sub, email: user.email, permissions: user.permissions },
      body.pageContext,
    );
  }

  @Get('insights/proactive')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Get proactive AI insight cards' })
  @ApiResponse({ status: 200, description: 'Proactive insights returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProactiveInsights(@CurrentUser() user: JwtPayloadUser) {
    return this.aiChatService.getProactiveInsights({
      userId: user.sub,
      email: user.email,
      permissions: user.permissions,
    });
  }

  @Post('confirm')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Confirm and execute an AI-assisted write operation' })
  @ApiResponse({ status: 200, description: 'Write operation executed' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async confirmWrite(@Body() body: ConfirmWriteDto, @CurrentUser() user: JwtPayloadUser) {
    return this.aiChatService.confirmWrite(body.action, body.payload, {
      userId: user.sub,
      email: user.email,
      permissions: user.permissions,
    });
  }
}
