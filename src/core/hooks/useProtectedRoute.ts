import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../store/authStore';

export function useProtectedRoute() {
  const router = useRouter();
  const segments = useSegments();
  const { user, role, is_superadmin, initialized } = useAuthStore();

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAdminGroup = segments[0] === '(admin)';
    const inJudgeGroup = segments[0] === 'judge';
    const inSuperGroup = segments[0] === '(super)';
    const inPublicGroup = segments[0] === '(public)';

    // --- Unauthenticated ---
    if (!user) {
      if (
        !inPublicGroup && 
        !inAuthGroup && 
        segments[0] !== 'stage-management' && 
        segments[0] !== 'candidate' && 
        segments[0] !== 'unit-profile' && 
        !inJudgeGroup && 
        segments[0] !== 'notifications'
      ) {
        router.replace('/(public)');
      }
      return;
    }

    // --- Authenticated ---
    // 1. Route from root / auth screens to the correct home
    if (inAuthGroup || (segments as string[]).length === 0) {
      if (is_superadmin) {
        router.replace('/(super)');
      } else if (role === 'admin') {
        router.replace('/(admin)');
      } else if (role === 'judge') {
        router.replace('/judge');
      } else {
        router.replace('/(public)');
      }
      return;
    }

    // 2. Superadmin strict isolation: block from /(admin) and /(judge)
    if (is_superadmin && (inAdminGroup || inJudgeGroup)) {
      router.replace('/(super)');
      return;
    }

    // 3. Non-superadmins cannot access /(super)
    if (inSuperGroup && !is_superadmin) {
      router.replace('/(public)');
      return;
    }

    // 4. Role-based group enforcement
    if (inAdminGroup && role !== 'admin') {
      router.replace('/(public)');
      return;
    }

    // Judge group: allow judge role AND admin role (admin can preview the portal)
    if (inJudgeGroup && role !== 'judge' && role !== 'admin') {
      router.replace('/(public)');
      return;
    }
  }, [user, role, is_superadmin, initialized, segments]);
}
