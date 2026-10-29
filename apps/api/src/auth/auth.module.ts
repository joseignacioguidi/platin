import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config';
import { SettingsModule } from '../settings/settings.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LinkTicketService } from './oauth/link-ticket.service';
import { OAUTH_PROVIDERS } from './oauth/oauth-provider';
import { OAuthProviderRegistry, providersFromConfig } from './oauth/oauth-provider.registry';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';
import { SessionCookie } from './session-cookie';
import { SignInMethodsController } from './sign-in-methods.controller';
import { SignInMethodsService } from './sign-in-methods.service';
import { UserOnboardingService } from './user-onboarding.service';

@Module({
  imports: [
    SettingsModule,
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController, OAuthController, SignInMethodsController],
  providers: [
    AuthService,
    PasswordService,
    RefreshTokenService,
    UserOnboardingService,
    SessionCookie,
    SignInMethodsService,
    LinkTicketService,
    OAuthService,
    OAuthProviderRegistry,
    { provide: OAUTH_PROVIDERS, inject: [AppConfig], useFactory: providersFromConfig },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
