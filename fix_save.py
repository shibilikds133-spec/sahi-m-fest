import re

with open('src/components/leaderboard/PosterStudio/index.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

old_logic = \"\"\"                <button
                  onClick={async () => {
                    setIsSaving(true);
                    await saveDraft();
                    // Also persist layers to Supabase for publishable templates
                    if (activeTemplate?.isPublishable && activeTemplate.id) {
                      const currentLayers = useLayerStore.getState().layers;
                      await supabase
                        .from('poster_templates')
                        .update({
                          layers: currentLayers,
                          background_url: activeTemplate.background_url,
                          width: activeTemplate.width,
                          height: activeTemplate.height,
                          aspect_ratio: activeTemplate.aspect_ratio,
                        })
                        .eq('id', activeTemplate.id);
                      queryClient.invalidateQueries({ queryKey: ['poster-templates', festivalId] });
                    }
                    setIsSaving(false);
                  }}\"\"\"

new_logic = \"\"\"                <button
                  onClick={async () => {
                    setIsSaving(true);
                    await saveDraft();
                    
                    const currentLayers = useLayerStore.getState().layers;
                    const currentBg = activeTemplate?.background_url || '';
                    
                    if (activeTemplate?.isPublishable && activeTemplate.id && activeTemplate.id !== 'starter-template') {
                      await supabase
                        .from('poster_templates')
                        .update({
                          layers: currentLayers,
                          background_url: currentBg,
                          width: activeTemplate.width,
                          height: activeTemplate.height,
                          aspect_ratio: activeTemplate.aspect_ratio,
                        })
                        .eq('id', activeTemplate.id);
                      queryClient.invalidateQueries({ queryKey: ['poster-templates', festivalId] });
                    } else {
                      const templateName = window.prompt('Enter a name to save this new template:', 'Custom Template');
                      if (templateName) {
                        const newId = crypto.randomUUID();
                        const { error } = await supabase
                          .from('poster_templates')
                          .insert({
                            id: newId,
                            tenant_id: tenantId,
                            festival_id: festivalId,
                            name: templateName,
                            background_url: currentBg,
                            width: activeTemplate?.width || 1080,
                            height: activeTemplate?.height || 1080,
                            aspect_ratio: activeTemplate?.aspect_ratio || '1:1',
                            layers: currentLayers,
                            is_active: true,
                            status: 'draft'
                          });
                        if (!error) {
                          useTemplateStore.getState().setActiveTemplate({
                            ...activeTemplate!,
                            id: newId,
                            name: templateName,
                            isPublishable: true,
                            isLocal: false
                          });
                          queryClient.invalidateQueries({ queryKey: ['poster-templates', festivalId] });
                        } else {
                          alert('Failed to save template: ' + error.message);
                        }
                      }
                    }
                    useTemplateStore.getState().markSaved();
                    setIsSaving(false);
                  }}\"\"\"

if old_logic in code:
    code = code.replace(old_logic, new_logic)
    with open('src/components/leaderboard/PosterStudio/index.tsx', 'w', encoding='utf-8') as f:
        f.write(code)
    print("Replaced successfully")
else:
    print("Warning: Old logic not found")
