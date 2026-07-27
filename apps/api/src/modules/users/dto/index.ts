import { IsString, IsEmail, IsNotEmpty, IsOptional, MinLength, IsIn } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsIn(['ADMIN', 'VIEWER'])
  role: 'ADMIN' | 'VIEWER';
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  username?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsIn(['ADMIN', 'VIEWER'])
  @IsOptional()
  role?: 'ADMIN' | 'VIEWER';
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class DisableTotpDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
