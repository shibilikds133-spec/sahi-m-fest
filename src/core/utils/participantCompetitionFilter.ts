type CompetitionRegistration = {
  item_id?: string | null;
  participant_id?: string | null;
  entry_kind?: string | null;
  status?: string | null;
  group_members?: { participant_id?: string | null }[] | null;
};

type CategoryParticipant = { category_code?: string | null };
type ConfiguredCategory = { code?: string | null; name?: string | null };

const normalizeCategory = (value?: string | null) => (value ?? '').trim().toUpperCase();

export function isGeneralCategoryCode(value?: string | null): boolean {
  const code = normalizeCategory(value);
  return code === 'GN' || code === 'GENERAL';
}

export function participantHasGeneralTeamRegistration(
  registrations: CompetitionRegistration[],
  participantId: string,
): boolean {
  return registrations.some((registration) => registration.entry_kind === 'general_team'
    && registration.status?.toLowerCase() !== 'rejected'
    && registration.group_members?.some((member) => member.participant_id === participantId));
}

export function buildParticipantCategoryOptions(
  participants: CategoryParticipant[],
  configuredCategories: ConfiguredCategory[],
  isCollegeFest: boolean,
  includeGeneral: boolean,
): { id: string; label: string }[] {
  const codes = new Map<string, string>();
  if (isCollegeFest) {
    for (const category of configuredCategories) {
      const code = String(category.code ?? '').trim();
      if (code && !isGeneralCategoryCode(code)) codes.set(code.toUpperCase(), category.name || code);
    }
  } else {
    for (const participant of participants) {
      const code = String(participant.category_code ?? '').trim();
      if (code && !isGeneralCategoryCode(code)) codes.set(code.toUpperCase(), code.toUpperCase());
    }
  }

  if (includeGeneral) codes.set('GN', 'General');
  return [
    { id: 'All', label: 'Category: All' },
    ...Array.from(codes, ([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

export function participantHasCompetitionRegistration(
  registrations: CompetitionRegistration[],
  participantId: string,
  itemId: string,
  categoryCode?: string | null,
  participantCategoryCode?: string | null,
): boolean {
  return registrations.some((registration) => {
    if (registration.item_id !== itemId || registration.status?.toLowerCase() === 'rejected') return false;

    const isGeneralTeam = registration.entry_kind === 'general_team';
    const isParticipantInEntry = registration.participant_id === participantId
      || (isGeneralTeam && registration.group_members?.some((member) => member.participant_id === participantId));
    if (!isParticipantInEntry) return false;

    // General team competition entries use category GN, while their roster
    // members remain in their own participant categories (LP/UP/HS/etc.).
    return isGeneralTeam || !categoryCode
      || normalizeCategory(participantCategoryCode) === normalizeCategory(categoryCode);
  });
}
