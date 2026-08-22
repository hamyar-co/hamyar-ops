import { SetMetadata } from '@nestjs/common';

export type Role = 'ADMIN' | 'VIEWER';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
