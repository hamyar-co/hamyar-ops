export interface CreateUserDto {
  username: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'VIEWER';
}

export interface UpdateUserDto {
  username?: string;
  email?: string;
  role?: 'ADMIN' | 'VIEWER';
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordDto {
  newPassword: string;
}
