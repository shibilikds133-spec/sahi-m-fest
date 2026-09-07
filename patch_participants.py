import re

with open('src/app/(admin)/participants/[id]/index.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add actionModal state
state_code = """
  // Custom Action Modal State
  const [actionModal, setActionModal] = useState<{
    visible: boolean;
    type: 'alert' | 'confirm' | 'prompt_reason' | 'prompt_date' | 'status_select';
    title: string;
    message: string;
    inputValue?: string;
    action: ((value?: any) => void) | null;
  }>({
    visible: false,
    type: 'alert',
    title: '',
    message: '',
    inputValue: '',
    action: null
  });

  const closeActionModal = () => setActionModal({ ...actionModal, visible: false, action: null });
"""

code = code.replace("const [eventsSectionExpanded, setEventsSectionExpanded] = useState(isDesktopProfile);", 
                    "const [eventsSectionExpanded, setEventsSectionExpanded] = useState(isDesktopProfile);\n" + state_code)


# Replace handleDelete
handle_delete_orig = """  const handleDelete = async () => {
    if (!participantId) return;
    const msg = 'Are you sure you want to delete this participant?';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) {
        try {
          await deleteParticipant(participantId);
          goBack();
        } catch (error: any) {
          window.alert(error.message);
        }
      }
    } else {
      Alert.alert('Confirm Delete', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteParticipant(participantId);
              goBack();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
        }}
      ]);
    }
  };"""

handle_delete_new = """  const handleDelete = async () => {
    if (!participantId) return;
    const msg = 'Are you sure you want to delete this participant?';
    setActionModal({
      visible: true,
      type: 'confirm',
      title: 'Confirm Delete',
      message: msg,
      action: async () => {
        try {
          await deleteParticipant(participantId);
          goBack();
        } catch (error: any) {
          setActionModal({ visible: true, type: 'alert', title: 'Error', message: error.message, action: null });
        }
      }
    });
  };"""

code = code.replace(handle_delete_orig, handle_delete_new)


# Replace promptStatusChange
prompt_status_change_orig = """  const promptStatusChange = () => {
    if (participant.is_locked) return;
    if (isBanned && participant.status !== 'approved') {
       if (Platform.OS === 'web') {
         const newStatus = window.prompt(`Update status for ${participant.name} (pending/rejected):`, participant.status || 'pending');
         if (newStatus === 'rejected') {
           const reason = window.prompt('Enter rejection reason:');
           handleStatusUpdate('rejected', reason);
         } else if (newStatus === 'pending') {
           handleStatusUpdate('pending');
         } else if (newStatus === 'approved') {
           window.alert('Cannot approve a banned participant.');
         }
       } else {
         Alert.alert('Update Status', 'Participant is banned. Approval blocked.', [
           { text: 'Pending', onPress: () => handleStatusUpdate('pending') },
           { text: 'Reject', onPress: () => handleStatusUpdate('rejected', 'Plagiarism Ban'), style: 'destructive' },
           { text: 'Cancel', style: 'cancel' }
         ]);
       }
       return;
    }

    if (Platform.OS === 'web') {
      const newStatus = window.prompt(`Update status for ${participant.name} (pending/approved/rejected):`, participant.status || 'pending');
      if (newStatus === 'rejected') {
        const reason = window.prompt('Enter rejection reason:');
        handleStatusUpdate('rejected', reason);
      } else if (newStatus === 'approved') {
        handleStatusUpdate('approved', null);
      } else if (newStatus === 'pending') {
        handleStatusUpdate('pending', null);
      }
    } else {
      Alert.alert('Update Status', `Select new status for ${participant.name}`, [
        { text: 'Pending', onPress: () => handleStatusUpdate('pending', null) },
        { text: 'Approve', onPress: () => handleStatusUpdate('approved', null) },
        { text: 'Reject', onPress: () => handleStatusUpdate('rejected', 'Rejected by admin'), style: 'destructive' },
        { text: 'Cancel', style: 'cancel' }
      ]);
    }
  };"""

prompt_status_change_new = """  const promptStatusChange = () => {
    if (participant.is_locked) return;
    
    setActionModal({
      visible: true,
      type: 'status_select',
      title: 'Update Status',
      message: isBanned && participant.status !== 'approved' ? 'Participant is banned. Approval blocked.' : `Select new status for ${participant.name}`,
      inputValue: participant.status || 'pending',
      action: async (val: any) => {
        if (!val) return;
        if (val.status === 'approved' && isBanned && participant.status !== 'approved') {
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Error', message: 'Cannot approve a banned participant.', action: null });
          }, 300);
          return;
        }
        if (val.status === 'rejected') {
          setTimeout(() => {
            setActionModal({
              visible: true,
              type: 'prompt_reason',
              title: 'Rejection Reason',
              message: 'Enter rejection reason:',
              inputValue: isBanned ? 'Plagiarism Ban' : '',
              action: async (reason: string) => {
                await handleStatusUpdate('rejected', reason);
              }
            });
          }, 300);
        } else {
          await handleStatusUpdate(val.status, null);
        }
      }
    });
  };"""

code = code.replace(prompt_status_change_orig, prompt_status_change_new)


# Replace handleBan
handle_ban_orig = """  const handleBan = async () => {
    if (Platform.OS === 'web') {
      const banUntil = window.prompt('Enter ban until date (YYYY-MM-DD) or leave empty to remove ban:', participant.plagiarism_ban_until || '');
      const newDate = banUntil ? new Date(banUntil).toISOString() : null;
      try {
        await updateParticipant({ id: participantId!, updates: { plagiarism_ban_until: newDate } });
      } catch (error: any) {
        window.alert(error.message);
      }
    }
  };"""

handle_ban_new = """  const handleBan = async () => {
    setActionModal({
      visible: true,
      type: 'prompt_date',
      title: 'Plagiarism Ban',
      message: 'Enter ban until date (YYYY-MM-DD) or leave empty to remove ban:',
      inputValue: participant.plagiarism_ban_until ? new Date(participant.plagiarism_ban_until).toISOString().split('T')[0] : '',
      action: async (banUntil: string) => {
        const newDate = banUntil ? new Date(banUntil).toISOString() : null;
        try {
          await updateParticipant({ id: participantId!, updates: { plagiarism_ban_until: newDate } });
        } catch (error: any) {
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Error', message: error.message, action: null });
          }, 300);
        }
      }
    });
  };"""

code = code.replace(handle_ban_orig, handle_ban_new)


# Replace handleRemoveEvent
handle_remove_orig = """  const handleRemoveEvent = async (event: any) => {
    if (!event?.id || !participantId) return;
    const itemName = event.items?.item_name_en || event.items?.item_code || 'this item';
    const message = `Remove ${itemName} from this participant? The assignment can be added again later. If marks, results, or stage records already exist, the system will safely block the removal.`;

    const confirmed = Platform.OS === 'web'
      ? window.confirm(message)
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Remove Assignment', message, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!confirmed) return;

    try {
      const result = await deleteRegistration({
        registrationId: event.id,
        itemId: event.item_id,
        reason: 'Admin removed participant-item assignment during festival preparation.',
      });
      if (result?.status === 'blocked') {
        const blockedMessage = result.message || 'This assignment has dependent competition data and was not removed.';
        if (Platform.OS === 'web') window.alert(blockedMessage);
        else Alert.alert('Assignment Not Removed', blockedMessage);
        return;
      }
      Alert.alert('Removed', 'The item assignment was safely removed.');
    } catch (error: any) {
      const messageText = String(error?.message || 'Unable to remove this assignment.');
      const protectedRecord = /foreign key|violates|referenced|constraint/i.test(messageText);
      const safeMessage = protectedRecord
        ? 'This assignment already has competition records (such as marks, results, or stage data), so it was not removed. This protects the existing history.'
        : messageText;
      if (Platform.OS === 'web') window.alert(safeMessage);
      else Alert.alert('Assignment Not Removed', safeMessage);
    }
  };"""

handle_remove_new = """  const handleRemoveEvent = async (event: any) => {
    if (!event?.id || !participantId) return;
    const itemName = event.items?.item_name_en || event.items?.item_code || 'this item';
    const message = `Remove ${itemName} from this participant? The assignment can be added again later. If marks, results, or stage records already exist, the system will safely block the removal.`;

    setActionModal({
      visible: true,
      type: 'confirm',
      title: 'Remove Assignment',
      message: message,
      action: async () => {
        try {
          const result = await deleteRegistration({
            registrationId: event.id,
            itemId: event.item_id,
            reason: 'Admin removed participant-item assignment during festival preparation.',
          });
          if (result?.status === 'blocked') {
            const blockedMessage = result.message || 'This assignment has dependent competition data and was not removed.';
            setTimeout(() => {
              setActionModal({ visible: true, type: 'alert', title: 'Assignment Not Removed', message: blockedMessage, action: null });
            }, 300);
            return;
          }
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Removed', message: 'The item assignment was safely removed.', action: null });
          }, 300);
        } catch (error: any) {
          const messageText = String(error?.message || 'Unable to remove this assignment.');
          const protectedRecord = /foreign key|violates|referenced|constraint/i.test(messageText);
          const safeMessage = protectedRecord
            ? 'This assignment already has competition records (such as marks, results, or stage data), so it was not removed. This protects the existing history.'
            : messageText;
          setTimeout(() => {
            setActionModal({ visible: true, type: 'alert', title: 'Assignment Not Removed', message: safeMessage, action: null });
          }, 300);
        }
      }
    });
  };"""

code = code.replace(handle_remove_orig, handle_remove_new)

# Add Modal JSX before closing </ScrollView>
modal_jsx = """
      {/* Action Modal */}
      {actionModal.visible && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 16, width: '100%', maxWidth: 400, padding: 24, zIndex: 10000, elevation: 10 }}>
            <Text className="font-poppins-bold text-lg mb-2 text-ssf-text">{actionModal.title}</Text>
            {!!actionModal.message && <Text className="font-poppins text-sm text-ssf-text-muted mb-4">{actionModal.message}</Text>}
            
            {actionModal.type === 'status_select' && (
              <View className="mb-4">
                <SsfSelectMenu
                  value={actionModal.inputValue || 'pending'}
                  onValueChange={(val) => setActionModal({ ...actionModal, inputValue: val })}
                  options={[
                    { label: 'Pending', value: 'pending' },
                    { label: 'Approved', value: 'approved' },
                    { label: 'Rejected', value: 'rejected' },
                  ]}
                  placeholder="Select Status"
                />
              </View>
            )}

            {(actionModal.type === 'prompt_reason' || actionModal.type === 'prompt_date') && (
              <View className="mb-4">
                <TextInput
                  className="border border-ssf-border rounded-xl p-3 font-poppins text-ssf-text"
                  value={actionModal.inputValue}
                  onChangeText={(val) => setActionModal({ ...actionModal, inputValue: val })}
                  placeholder={actionModal.type === 'prompt_date' ? 'YYYY-MM-DD' : 'Enter reason here...'}
                  autoFocus
                />
              </View>
            )}

            <View className="flex-row justify-end gap-x-3 mt-2">
              {actionModal.type !== 'alert' && (
                <TouchableOpacity onPress={closeActionModal} className="px-4 py-2 rounded-xl border border-slate-200">
                  <Text className="font-poppins-bold text-ssf-text">Cancel</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  const action = actionModal.action;
                  const type = actionModal.type;
                  const val = type === 'status_select' ? { status: actionModal.inputValue } : actionModal.inputValue;
                  closeActionModal();
                  if (action) {
                    if (type === 'alert' || type === 'confirm') action();
                    else action(val);
                  }
                }}
                className={`px-4 py-2 rounded-xl ${actionModal.type === 'alert' ? 'bg-ssf-primary w-full items-center' : (actionModal.title.includes('Delete') || actionModal.title.includes('Remove') || actionModal.title.includes('Ban') ? 'bg-red-600' : 'bg-ssf-primary')}`}
              >
                <Text className="font-poppins-bold text-white">
                  {actionModal.type === 'alert' ? 'OK' : (actionModal.title.includes('Delete') || actionModal.title.includes('Remove') ? 'Confirm' : 'Proceed')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
"""

code = code.replace("    </ScrollView>\n  );\n}", modal_jsx + "    </ScrollView>\n  );\n}")

with open('src/app/(admin)/participants/[id]/index.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
