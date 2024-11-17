import { Metadata } from "./common";
import { Permission } from "./permissions";

export interface Location {
  id: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  isPrimary: boolean;
}

export interface Department {
  id: string;
  name: string;
  headCount: number;
  budget?: number;
}

export type Plan = "free" | "pro" | "team" | "enterprise";

export interface PricingPlanFeature {
  name: string;
  description: string;
  isEnabled: boolean;
}

export interface PricingPlan {
  planId: string;
  name: Plan;
  price: number;
  billingCycle: "monthly" | "annual";
  features: PricingPlanFeature[];
  maxUsers?: number;
  maxStorage?: number;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  total: number;
}

export interface Order {
  orderId: string;
  createdAt: Date;
  status: "pending" | "processing" | "completed" | "cancelled";
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  paymentStatus: "pending" | "paid" | "failed";
}

export interface Team extends Metadata {
  name: string;
  description?: string;
  departments: Department[];
  members: string[];
  leaderId?: string;
  parentTeamId?: string;
  logoUrl?: string;
}

export type TeamPermission = {
  teamId: string;
  permissions: Permission[];
};

export type DepartmentPermission = {
  departmentId: string;
  permissions: Permission[];
};

export type PaymentMethod = {
  id: string;
  type: "credit_card" | "bank_transfer" | "paypal";
  lastFour?: string;
  expiryDate?: string;
  isDefault: boolean;
};

export interface Organization extends Metadata {
  name: string;
  description?: string;
  industry: string;
  size: "startup" | "small" | "medium" | "large" | "enterprise";
  website: string;
  logoUrl?: string;
  locations: Location[];
  teams: Team[];
  linkedInUrl?: string;
  twitterHandle?: string;
  culture?: string[];
  benefits?: string[];
  currentPlan: PricingPlan;
  planHistory: {
    plan: PricingPlan;
    startDate: Date;
    endDate?: Date;
  }[];
  permissions: {
    roles: {
      name: string;
      permissions: Permission[];
    }[];
    teamPermissions: TeamPermission[];
    departmentPermissions: DepartmentPermission[];
  };
  orders: Order[];
  billingAddress?: Location;
  paymentMethods?: PaymentMethod[];
}
