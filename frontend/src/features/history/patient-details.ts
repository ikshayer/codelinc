import type { PatientDetails, PatientProfile } from "@/lib/domain/types";

/** Patient details for an analysis. The profile ID and account email stay on the profile. */
export function patientDetailsOf(profile: PatientProfile): PatientDetails {
  return { displayName: profile.displayName, fullName: profile.fullName, dateOfBirth: profile.dateOfBirth, contactEmail: profile.contactEmail };
}
