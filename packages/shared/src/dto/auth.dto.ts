export interface LoginDto {
  username: string;
  password: string;
  totpToken?: string;
}

export interface AuthTokensDto {
  accessToken: string;
  user: UserDto;
}

export interface UserDto {
  id: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'VIEWER';
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}
