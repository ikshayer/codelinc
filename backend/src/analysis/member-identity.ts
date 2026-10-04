import { z } from "zod";
import { IsoDate } from "../domain/primitives";

export const MemberIdentity = z.strictObject({ memberId: z.string().trim().min(1).max(150), dateOfBirth: IsoDate });
export type MemberIdentity = z.infer<typeof MemberIdentity>;
export const MemberLookupIdentity = z.union([MemberIdentity, z.strictObject({ displayName: z.string().trim().min(1).max(200), dateOfBirth: IsoDate })]);
export type MemberLookupIdentity = z.infer<typeof MemberLookupIdentity>;
