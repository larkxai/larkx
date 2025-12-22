import { Injectable } from '@nestjs/common';
import { App } from '../typing';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AppsService {
  private readonly apps: App[] = [];

  listByOrg(orgId: string): App[] {
    // In future, orgId-scoping should be enforced; demo filters by notes containing orgId for placeholder
    return this.apps.filter((a) => a.notes === orgId);
  }

  create(orgId: string, payload: { name: string; bundleId?: string; packageName?: string; notes?: string }): App {
    const now = new Date().toISOString();
    const newApp: App = {
      id: `app_${uuidv4()}`,
      name: payload.name,
      bundleId: payload.bundleId ?? null,
      packageName: payload.packageName ?? null,
      ownerUserId: 'user-001',
      notes: orgId,
      createdAt: now,
      updatedAt: now,
    };
    this.apps.unshift(newApp);
    return newApp;
  }
}


