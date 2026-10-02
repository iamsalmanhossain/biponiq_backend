// src/types/auth.ts

export interface SocialLoginRequest {
  token: string;
  provider: 'GOOGLE';
}

export interface GooglePayload {
  email?: string;
  name?: string;
  picture?: string;
}