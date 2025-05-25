import { ISODateString, Metadata } from "./common";

export type UserRole = "admin" | "user";

export interface User extends Metadata {
  email: string;
  name: string;
  role: UserRole;
  lastLoginAt?: ISODateString;
}
