import React from 'react';
import { Redirect } from 'expo-router';

export default function PublicLoginRedirect() {
  return <Redirect href="/(auth)/login" />;
}
