import { create } from 'zustand';

export interface NotificationBanner {
  readonly id: string;
  readonly variant: 'info' | 'success' | 'warning' | 'error';
  readonly message: string;
}

interface UiState {
  sessionToken: string | null;
  activeOrganizationId: string | null;
  isChaosDrawerOpen: boolean;
  banner: NotificationBanner | null;
  setSessionContext: (token: string | null, organizationId: string | null) => void;
  setActiveOrganizationId: (organizationId: string | null) => void;
  setChaosDrawerOpen: (open: boolean) => void;
  showBanner: (variant: NotificationBanner['variant'], message: string) => void;
  clearBanner: () => void;
  resetUiStore: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sessionToken: null,
  activeOrganizationId: null,
  isChaosDrawerOpen: false,
  banner: null,
  setSessionContext: (token, organizationId) =>
    set({ sessionToken: token, activeOrganizationId: organizationId }),
  setActiveOrganizationId: (organizationId) => set({ activeOrganizationId: organizationId }),
  setChaosDrawerOpen: (open) => set({ isChaosDrawerOpen: open }),
  showBanner: (variant, message) =>
    set({
      banner: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        variant,
        message,
      },
    }),
  clearBanner: () => set({ banner: null }),
  resetUiStore: () =>
    set({
      sessionToken: null,
      activeOrganizationId: null,
      isChaosDrawerOpen: false,
      banner: null,
    }),
}));