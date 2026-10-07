import {afterEach, describe, expect, it, vi} from 'vitest';
import {POST as manual} from '@/app/api/admin/sync/route';
import {POST as scheduled} from '@/app/api/internal/sync/bullshooter/route';

const mocks = vi.hoisted(() => ({admin: vi.fn(), database: vi.fn(), sync: vi.fn(), provider: vi.fn()}));
vi.mock('@/lib/auth', () => ({requireAdmin: mocks.admin}));
vi.mock('@/db/client', () => ({getDatabase: mocks.database}));
vi.mock('@/lib/sync/service', () => ({synchronize: mocks.sync}));
vi.mock('@/lib/bullshooter/provider', () => ({BullshooterProvider: class { constructor() { mocks.provider(); } }}));
vi.mock('next/cache', () => ({revalidatePath: vi.fn()}));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function disabled() {
  for (const [key,value] of Object.entries({APP_ENV:'development', APP_URL:'http://localhost:3000', DATABASE_MODE:'local', SYNC_ENABLED:'false'})) vi.stubEnv(key,value);
  vi.stubEnv('VERCEL',undefined);
}
describe('Production sync entrypoints obey the explicit environment switch', () => {
  it.each([['manual',manual],['scheduled',scheduled]] as const)('%s rejects disabled sync before auth, database, provider or importer work', async (_,post) => {
    disabled();
    const response = await post(new Request('http://localhost:3000/api/sync',{method:'POST',headers:{origin:'http://localhost:3000'}}));
    expect(response.status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('even a scheduler bearer secret cannot override SYNC_ENABLED=false', async () => {
    disabled(); const key='isolated-fixture-secret-'.repeat(3); vi.stubEnv('SYNC_CRON_SECRET',key);
    expect((await scheduled(new Request('http://localhost:3000/api/sync',{method:'POST',headers:{authorization:`Bearer ${key}`}}))).status).toBe(403);
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
  });
});
