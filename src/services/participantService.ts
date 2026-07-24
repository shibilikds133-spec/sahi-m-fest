import { participantRepository } from '../lib/repositories/participantRepository';
import { ruleEngine } from '../core/rules/ruleEngine';
import { uploadService } from './storage/uploadService';

export type ParticipantStatus = 'pending' | 'approved' | 'rejected';

export type OrganisationOption = {
  id: string;
  name: string;
  org_type: string;
};

export type PublicCandidateProfile = {
  profile: {
    id: string;
    slug: string;
    name: string;
    photo_url: string | null;
    category_code: string | null;
    bio: string;
    organisation_name: string | null;
    organisation_type: string | null;
  };
  participated_items: {
    registration_id: string;
    item_id: string | null;
    item_name: string;
    item_name_ml: string;
    category_codes: string[];
    participation_type: string;
    status: string;
  }[];
  published_results: {
    result_id: string;
    item_id: string | null;
    item_name: string;
    item_name_ml: string;
    rank: number | null;
    grade: string | null;
    points_awarded: number;
    published_at: string | null;
  }[];
};

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const resolveExistingPhotoKey = (participant: any): string | null => {
  if (participant?.profile_photo_object_key) return participant.profile_photo_object_key;
  const photoUrl = participant?.photo_url;
  if (typeof photoUrl !== 'string') return null;
  if (photoUrl.startsWith('r2://')) return photoUrl.replace('r2://', '');
  const marker = '/profiles/';
  const markerIndex = photoUrl.indexOf(marker);
  if (markerIndex >= 0) return photoUrl.slice(markerIndex + 1).split('?')[0];
  return null;
};

export const participantService = {
  async listParticipants<T>(): Promise<T[]> {
    const { data, error } = await participantRepository.listParticipants<T>();
    throwIfError(error);
    return data;
  },

  async getParticipant<T>(participantId: string): Promise<T | null> {
    const { data, error } = await participantRepository.getParticipant<T>(participantId);
    throwIfError(error);
    return data;
  },

  async getPublicCandidateProfile(slug: string): Promise<PublicCandidateProfile | null> {
    const { data, error } = await participantRepository.getPublicCandidateProfile<PublicCandidateProfile>(slug);
    throwIfError(error);
    return data;
  },

  async getParticipantRegistrations<T>(participantId: string): Promise<T[]> {
    const { data, error } = await participantRepository.getParticipantRegistrations<T>(participantId);
    throwIfError(error);
    return data;
  },

  async getRegistrationsByItem<T>(itemId: string, tenantId: string): Promise<T[]> {
    const { data, error } = await participantRepository.getRegistrationsByItem<T>(itemId, tenantId);
    throwIfError(error);
    return data;
  },

  async listRegistrationsByFestival<T>(festivalId: string): Promise<T[]> {
    const { data, error } = await participantRepository.listRegistrationsByFestival<T>(festivalId);
    throwIfError(error);
    return data;
  },

  async generateCodeLetters(scheduleId: string, itemId: string, tenantId: string, overwrite = false): Promise<{ smartPriorityApplied: boolean } | void> {
    const allRegistrations = await this.getRegistrationsByItem<any>(itemId, tenantId);
    const registrations = (allRegistrations || []).filter((r: any) => r.status !== 'rejected' && r.is_verified);
    if (!registrations || registrations.length === 0) {
      throw new Error('No verified and active participants registered for this event yet.');
    }

    const assignedRegs = overwrite ? [] : registrations.filter((r: any) => !!r.code_letter);
    const unassignedRegs = overwrite ? registrations : registrations.filter((r: any) => !r.code_letter);

    // If everyone is assigned and we're not overwriting, nothing to do.
    if (unassignedRegs.length === 0) return;

    let smartPriorityApplied = false;

    let startIndex = 0;
    if (assignedRegs.length > 0) {
      let maxCharCode = 64;
      for (const r of assignedRegs) {
        if (r.code_letter && r.code_letter.length === 1) {
          const code = r.code_letter.charCodeAt(0);
          if (code > maxCharCode) maxCharCode = code;
        }
      }
      startIndex = maxCharCode - 64; 
    }

    // Determine how many new letters we need. We'll grab a larger pool in case of conflicts
    const participantIds = unassignedRegs.map((r: any) => r.participant_id);
    const { data: conflictsMap, error: conflictErr } = await participantRepository.getParticipantConflicts(participantIds, scheduleId);
    if (conflictErr) throw new Error(conflictErr.message);

    // We generate a sufficient pool of candidate letters starting from startIndex
    const poolSize = unassignedRegs.length; // Exact letters needed
    const candidatePool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(startIndex, startIndex + poolSize);
    
    // Shuffle the available letters
    for (let i = candidatePool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidatePool[i], candidatePool[j]] = [candidatePool[j], candidatePool[i]];
    }

    const usedLettersInCurrentEvent = new Set(assignedRegs.map((r: any) => r.code_letter));

    const results = await Promise.all(
      unassignedRegs.map(async (reg: any) => {
        const participantConflicts = conflictsMap?.[reg.participant_id] || new Set<string>();
        
        let assignedLetter = null;
        
        const safeCandidates = candidatePool.filter(
          letter => !usedLettersInCurrentEvent.has(letter) && !participantConflicts.has(letter)
        );

        if (safeCandidates.length > 0) {
          if (participantConflicts.size === 0) {
            assignedLetter = safeCandidates[0];
          } else {
            // Sort by priority (maximum rotation separation)
            safeCandidates.sort((a, b) => {
              const scoreA = Math.min(...Array.from(participantConflicts).map(c => Math.abs(c.charCodeAt(0) - a.charCodeAt(0))));
              const scoreB = Math.min(...Array.from(participantConflicts).map(c => Math.abs(c.charCodeAt(0) - b.charCodeAt(0))));
              return scoreB - scoreA; // Descending order
            });
            assignedLetter = safeCandidates[0];
            smartPriorityApplied = true;
          }
          usedLettersInCurrentEvent.add(assignedLetter);
          candidatePool.splice(candidatePool.indexOf(assignedLetter), 1);
        }

        // Fallback if absolutely all letters are conflicted (very rare unless 26 simultaneous events)
        if (!assignedLetter) {
           for (let i = 0; i < candidatePool.length; i++) {
             const letter = candidatePool[i];
             if (!usedLettersInCurrentEvent.has(letter)) {
               assignedLetter = letter;
               usedLettersInCurrentEvent.add(letter);
               candidatePool.splice(i, 1);
               break;
             }
           }
        }

        if (!assignedLetter) throw new Error(`Not enough unique code letters available for participant ${reg.participant_id}`);

        return participantRepository.updateRegistration(reg.id, { code_letter: assignedLetter });
      })
    );

    const failed = results.find((r: any) => r.error);
    if (failed?.error) {
      throw new Error(`Failed to assign code letter: ${failed.error.message}`);
    }

    return { smartPriorityApplied };
  },

  async updateCodeLetter(registrationId: string, newLetter: string, scheduleId: string, tenantId: string): Promise<void> {
    // 1. Fetch current registration
    const { data: currentReg, error: regErr } = await participantRepository.getRegistrationsByItem<any>('', tenantId).then(async () => {
      // Actually we need the specific registration to get item_id and participant_id
      // Let's just use update without validation? No, we must validate.
      // Easiest is to fetch all registrations for the item to check intra-event duplicates
      return { data: null, error: null }; // placeholder
    });
    
    // Let's implement validation inside the hook or service properly
    throw new Error('Not implemented here yet');
  },

  async updateParticipant<T>(
    participantId: string,
    updates: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await participantRepository.updateParticipant<T>(participantId, {
      ...updates,
      updated_at: new Date().toISOString(),
    });
    throwIfError(error);
    if (!data) throw new Error('Participant was not returned after update');
    return data;
  },

  async uploadProfilePhoto<T>(
    participantId: string,
    file: Blob | File,
    context?: { tenantId?: string | null; festivalId?: string | null },
    onProgress?: (progress: number) => void,
  ): Promise<T> {
    const participant = await this.getParticipant<any>(participantId);
    if (!participant) throw new Error('Participant not found');

    const tenantId = context?.tenantId || participant.tenant_id;
    const festivalId = context?.festivalId || participant.festival_id;
    if (!tenantId || !festivalId) {
      throw new Error('Tenant and festival context are required before uploading a profile photo.');
    }

    const fileName = 'name' in file ? (file as File).name : '';
    const extension = fileName.split('.').pop() || file.type?.split('/').pop() || 'jpg';
    const existingKey = resolveExistingPhotoKey(participant);
    const metadata = await uploadService.uploadProfilePhoto(file, festivalId, tenantId, participantId, extension, onProgress);

    const updated = await this.updateParticipant<T>(participantId, {
      photo_url: metadata.file_url,
      profile_photo_object_key: metadata.object_key,
    });

    if (existingKey && existingKey !== metadata.object_key) {
      uploadService.deleteObject(existingKey).catch((error) => {
        console.warn('Unable to delete previous profile photo object:', error);
      });
    }

    return updated;
  },

  async removeProfilePhoto<T>(participantId: string): Promise<T> {
    const participant = await this.getParticipant<any>(participantId);
    if (!participant) throw new Error('Participant not found');

    const existingKey = resolveExistingPhotoKey(participant);
    const updated = await this.updateParticipant<T>(participantId, {
      photo_url: null,
      profile_photo_object_key: null,
    });

    if (existingKey) {
      uploadService.deleteObject(existingKey).catch((error) => {
        console.warn('Unable to delete removed profile photo object:', error);
      });
    }

    return updated;
  },

  async updateStatus<T>(
    participantId: string,
    status: ParticipantStatus,
    rejectionReason: string | null = null,
  ): Promise<T> {
    const updates: Record<string, unknown> = { status };
    if (rejectionReason !== null) {
      updates.rejection_reason = rejectionReason;
    }
    return this.updateParticipant<T>(participantId, updates);
  },

  async deleteParticipant(participantId: string): Promise<void> {
    const { error } = await participantRepository.deleteParticipant(participantId);
    throwIfError(error);
  },

  async deleteParticipants(participantIds: string[]): Promise<void> {
    const { error } = await participantRepository.deleteParticipants(participantIds);
    throwIfError(error);
  },

  async approveParticipants(participantIds: string[]): Promise<void> {
    const { error } = await participantRepository.updateParticipants(participantIds, {
      status: 'approved',
      updated_at: new Date().toISOString(),
    });
    throwIfError(error);
  },

  async generateChestNumber(categoryCode: string): Promise<string> {
    const { data, error } = await participantRepository.countParticipantsByCategory(categoryCode);
    throwIfError(error);
    return `${categoryCode}-${((data ?? 0) + 1).toString().padStart(3, '0')}`;
  },

  async createParticipant<T>(payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await participantRepository.createParticipant<T>(payload);
    throwIfError(error);
    if (!data) throw new Error('Participant was not returned after create');
    return data;
  },

  async createParticipants<T>(payloads: Record<string, unknown>[]): Promise<T[]> {
    if (payloads.length === 0) return [];
    const { data, error } = await participantRepository.createParticipants<T>(payloads);
    throwIfError(error);
    return data;
  },

  async registerParticipantForItem<T>(
    participant: any, 
    item: any, 
    festivalConfig: any
  ): Promise<{ data?: T; errors?: any[]; warnings?: any[] }> {
    // Fetch current registrations for rule engine
    const existingRegistrations = await this.getParticipantRegistrations<any>(participant.id);
    
    // Evaluate rules
    const validation = ruleEngine.evaluateRegistration({
      participant,
      item,
      existingRegistrations,
      festivalConfig
    });

    if (!validation.isValid) {
      return { errors: validation.errors, warnings: validation.warnings };
    }

    // Create the registration
    const payload = {
      tenant_id: participant.tenant_id,
      festival_id: participant.festival_id,
      participant_id: participant.id,
      item_id: item.id,
      organisation_id: participant.organisation_id,
      status: 'pending',
    };

    const { data, error } = await participantRepository.createRegistration<T>(payload);
    throwIfError(error);
    if (!data) throw new Error('Registration was not returned after create');
    
    return { data, warnings: validation.warnings };
  },

  async getDuplicateKeys(tenantId: string): Promise<Set<string>> {
    const { data, error } = await participantRepository.listParticipantDuplicateKeys(tenantId);
    throwIfError(error);

    return new Set(
      data.map((participant) => {
        const name = participant.name?.toLowerCase().trim();
        const dob = participant.dob
          ? new Date(participant.dob).toISOString().split('T')[0]
          : 'nodob';
        return `${name}_${dob}`;
      }),
    );
  },

  async getTenantOrgType(tenantId: string): Promise<string | null> {
    const { data, error } = await participantRepository.getTenantOrgType(tenantId);
    throwIfError(error);
    return data?.org_type ?? null;
  },

  async listOrganisations(tenantId: string): Promise<OrganisationOption[]> {
    const { data, error } = await participantRepository.listOrganisations<OrganisationOption>(tenantId);
    throwIfError(error);
    return data;
  },
};
