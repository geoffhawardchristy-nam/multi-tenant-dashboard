'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mockAuthApi } from '@/lib/mock-api/auth-api';
import { isMockApiError } from '@/lib/mock-api/errors';
import { useUiStore } from '@/store/ui-store';
import type { LoginRequest, SessionContextResponse } from '@/types/api';
import type { Permission } from '@/types/domain';
import { hasPermission } from './permissions';

const SESSION_STORAGE_KEY = 'nexus_admin_session_token_v1';

export interface AuthContextValue {
  readonly session: SessionContextResponse | null;
  readonly isInitializing: boolean;
  readonly isSwitchingOrg: boolean;
  readonly authError: string | null;
  readonly clearAuthError: () => void;
  readonly login: (credentials: LoginRequest) => Promise<SessionContextResponse>;
  readonly logout: (reasonMessage?: string) => Promise<void>;
  readonly switchOrganization: (targetOrganizationId: string) => Promise<void>;
  readonly simulateSessionExpiry: () => Promise<void>;
  readonly handleUnauthorizedError: (error: unknown) => boolean;
  readonly checkPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const { setSessionContext, showBanner, clearBanner, resetUiStore } = useUiStore();

  const [session, setSession] = useState<SessionContextResponse | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isSwitchingOrg, setIsSwitchingOrg] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const purgeTenantCaches = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] === 'tenant',
    });
  }, [queryClient]);

  const clearClientSessionState = useCallback(
    (expiryNotice?: string) => {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
      setSession(null);
      purgeTenantCaches();
      queryClient.clear();
      resetUiStore();

      if (expiryNotice) {
        setAuthError(expiryNotice);
        showBanner('warning', expiryNotice);
      } else {
        setAuthError(null);
      }
    },
    [purgeTenantCaches, queryClient, resetUiStore, showBanner]
  );

  useEffect(() => {
    let isMounted = true;
    const savedToken =
      typeof window !== 'undefined' ? window.sessionStorage.getItem(SESSION_STORAGE_KEY) : null;

    if (!savedToken) {
      setIsInitializing(false);
      return;
    }

    mockAuthApi
      .getSessionContext(savedToken)
      .then((restored) => {
        if (!isMounted) return;
        setSession(restored);
        setSessionContext(restored.token, restored.activeOrganization.id);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = isMockApiError(err)
          ? err.message
          : 'Your previous session expired. Please sign in again.';
        clearClientSessionState(msg);
      })
      .finally(() => {
        if (isMounted) {
          setIsInitializing(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [clearClientSessionState, setSessionContext]);

  const login = useCallback(
    async (credentials: LoginRequest): Promise<SessionContextResponse> => {
      setAuthError(null);
      clearBanner();
      purgeTenantCaches();

      const response = await mockAuthApi.login(credentials);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, response.token);
      }
      setSession(response);
      setSessionContext(response.token, response.activeOrganization.id);
      showBanner(
        'success',
        `Signed in as ${response.user.name} (${response.activeOrganization.name}).`
      );
      return response;
    },
    [clearBanner, purgeTenantCaches, setSessionContext, showBanner]
  );

  const logout = useCallback(
    async (reasonMessage?: string): Promise<void> => {
      const currentToken = session?.token;
      try {
        if (currentToken) {
          await mockAuthApi.logout(currentToken);
        }
      } finally {
        clearClientSessionState(reasonMessage);
      }
    },
    [clearClientSessionState, session?.token]
  );

  const handleUnauthorizedError = useCallback(
    (error: unknown): boolean => {
      if (isMockApiError(error) && error.status === 401) {
        clearClientSessionState(
          error.message || 'Your session has expired. Please sign in again to continue.'
        );
        return true;
      }
      return false;
    },
    [clearClientSessionState]
  );

  const switchOrganization = useCallback(
    async (targetOrganizationId: string): Promise<void> => {
      if (!session) {
        return;
      }
      if (targetOrganizationId === session.activeOrganization.id) {
        return;
      }

      setIsSwitchingOrg(true);
      setAuthError(null);

      try {
        const updatedSession = await mockAuthApi.switchOrganization({
          token: session.token,
          targetOrganizationId,
        });

        purgeTenantCaches();

        setSession(updatedSession);
        setSessionContext(updatedSession.token, updatedSession.activeOrganization.id);
        showBanner(
          'info',
          `Switched active tenant context to ${updatedSession.activeOrganization.name}. Previous tenant cache cleared.`
        );
      } catch (err: unknown) {
        if (!handleUnauthorizedError(err)) {
          const message = isMockApiError(err)
            ? err.message
            : 'Failed to switch organization.';
          showBanner('error', message);
          throw err;
        }
      } finally {
        setIsSwitchingOrg(false);
      }
    },
    [handleUnauthorizedError, purgeTenantCaches, session, setSessionContext, showBanner]
  );

  const simulateSessionExpiry = useCallback(async (): Promise<void> => {
    if (!session) return;
    await mockAuthApi.forceExpireSession(session.token);
    try {
      await mockAuthApi.getSessionContext(session.token);
    } catch (err: unknown) {
      handleUnauthorizedError(err);
    }
  }, [handleUnauthorizedError, session]);

  const checkPermission = useCallback(
    (permission: Permission): boolean => {
      return hasPermission(session?.user.role, permission);
    },
    [session?.user.role]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isInitializing,
      isSwitchingOrg,
      authError,
      clearAuthError,
      login,
      logout,
      switchOrganization,
      simulateSessionExpiry,
      handleUnauthorizedError,
      checkPermission,
    }),
    [
      session,
      isInitializing,
      isSwitchingOrg,
      authError,
      clearAuthError,
      login,
      logout,
      switchOrganization,
      simulateSessionExpiry,
      handleUnauthorizedError,
      checkPermission,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}