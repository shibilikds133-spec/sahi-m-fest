import { SahithyolsavLandingPage } from '../components/publicLanding/SahithyolsavLandingPage';
import { PublicLandingPage } from '../components/publicLanding/PublicLandingPage';

export default function Index() {
  const CUSTOM_TENANT_ID = 'f87172d1-ed27-4db4-842c-cc00d3d56de2';
  
  // Replace with actual domain-to-tenant resolution logic in the future
  // For now, if EXPO_PUBLIC_TENANT_ID is set in .env, it uses that, otherwise defaults to the custom tenant
  const currentTenantId = process.env.EXPO_PUBLIC_TENANT_ID || CUSTOM_TENANT_ID;

  if (currentTenantId === CUSTOM_TENANT_ID) {
    return <SahithyolsavLandingPage />;
  }

  return <PublicLandingPage />;
}

