import { adapterError } from "../shared";
import { fail, ok, type AuthAdapter } from "../types";

// Demo mode never simulates a Google login. Everyone is a guest; the only
// "profile" option is the clearly labeled synthetic demo profile.

const GOOGLE_UNAVAILABLE = "Google sign-in isn't set up in this demo.";

export const mockAuthAdapter: AuthAdapter = {
  mode: "demo",
  async googleAvailability() {
    return ok({ available: false, reason: GOOGLE_UNAVAILABLE });
  },
  async getSession() {
    return ok({ status: "guest" });
  },
  async signInWithGoogle() {
    return fail(adapterError("UNAVAILABLE", GOOGLE_UNAVAILABLE));
  },
  async signOut() {
    return ok(undefined);
  },
};
