import type { ReactNode } from "react";

/**
 * Fake identity provider used only by vite.visual-test.config.ts.
 * Normal Vite and production builds continue to load Clerk unchanged.
 */
export function ClerkProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: "studiocut-visual-test-user",
  };
}

export function useUser() {
  return {
    isLoaded: true,
    user: {
      id: "studiocut-visual-test-user",
      firstName: "Visual",
      lastName: "Test",
      fullName: "Visual Test",
      primaryEmailAddress: { emailAddress: "visual-test@example.invalid" },
      publicMetadata: {},
    },
  };
}

export function useClerk() {
  return { signOut: async () => undefined };
}

export function SignIn() {
  return null;
}

export function SignUp() {
  return null;
}

export function publishableKeyFromHost(
  _hostname: string,
  configuredKey?: string,
) {
  return configuredKey || "pk_test_visual_only";
}
