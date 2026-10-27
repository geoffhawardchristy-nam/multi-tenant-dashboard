'use client';

import React from 'react';
import { WorkspaceGuard } from '@/features/auth/workspace-guard';

export default function HomePage(): React.JSX.Element {
  return <WorkspaceGuard />;
}