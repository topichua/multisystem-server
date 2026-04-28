export type CreateCompanyWithOwnerInput = {
  companyName: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  /** Instagram / Facebook Graph token stored on company and on the new source row. */
  instagramToken: string;
  /** Facebook Page ID for the Instagram business; defaults to `pending` if omitted. */
  instagramPageId?: string | null;
  /** Instagram business account id used to match webhook entry.id. */
  instagramBusinessAccountId?: string | null;
  /** Instagram account id (IGSID/PSID) of the connected account owner. */
  instagramAccountId?: string | null;
};
