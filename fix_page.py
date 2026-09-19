import re

with open('src/components/publicLanding/SahithyolsavLandingPage.web.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

if 'useQuery' not in code:
    code = re.sub(r'import \{.*?\} from ''@tanstack/react-query'';', lambda m: m.group(0).replace('}', ', useQuery }'), code)

if 'import { supabase }' not in code:
    code = "import { supabase } from '../../core/config/supabase';\n" + code

hook_insertion = \"\"\"
  const { data: generatedPosters = [] } = useQuery({
    queryKey: ['public-generated-posters-item-results', festivalId],
    queryFn: async () => {
      if (!festivalId) return [];
      const { data, error } = await supabase
        .from('generated_assets')
        .select('*')
        .eq('festival_id', festivalId)
        .order('created_at', { ascending: false });
      if (error) return [];
      for (const asset of data) {
         if (asset.public_url && asset.public_url.startsWith('r2://')) {
            const objectKey = asset.public_url.replace('r2://', '');
            try {
              asset.resolved_url = await storageService.getPresignedUrl(objectKey, 'image/jpeg', 'download');
            } catch(e) {}
         } else {
            asset.resolved_url = asset.public_url;
         }
      }
      return data;
    },
    enabled: page === 'items' && !!festivalId
  });

  const groupedItemResults = React.useMemo(() => {
    if (!publishedResultsQuery.data) return [];
    const grouped: Record<string, any> = {};
    publishedResultsQuery.data.forEach((r: any) => {
      const key = r.item_id || r.item_name;
      if (!grouped[key]) {
        grouped[key] = {
          item_id: r.item_id,
          result_id: r.result_id,
          item_name: r.item_name,
          category: r.item_category_codes?.length ? r.item_category_codes[0] : r.participant_category_code,
          participants: []
        };
      }
      if (r.rank) {
        grouped[key].participants.push({
          name: r.participant_name,
          chest_no: r.chest_number,
          position: r.rank,
          grade: r.grade,
          organisation_name: r.organisation_name
        });
      }
    });
    return Object.values(grouped).sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [publishedResultsQuery.data]);
\"\"\"

code = re.sub(r'(const publishedResultsQuery = usePublicPublishedResults[^;]+;)', r'\1\n' + hook_insertion, code)

old_section = re.search(r'\{/\* Item Results Section \*/\}.*?\{/\* Festival Gallery \(Bento Grid\) \*/\}', code, re.DOTALL)

new_section = \"\"\"{/* Item Results Section */}
          {page === 'items' && (
          <section id="item-results" className="bg-transparent backdrop-blur-sm py-section-gap px-gutter border-alviora-border fade-in-up visible">
            <div className="max-w-container-max mx-auto">
              <div className="text-center mb-16">
                <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-4">Published Results</h2>
                <p className="font-body-lg text-body-lg text-alviora-body">Latest competition results.</p>
              </div>
              
              <div className="space-y-6">
                {groupedItemResults.length > 0 ? groupedItemResults.map((result: any, idx: number) => {
                  const poster = generatedPosters.find((p: any) => p.result_id === result.result_id || (p.item_id && p.item_id === result.item_id));
                  return (
                  <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-6 shadow-md flex flex-col md:flex-row gap-6 items-center">
                    <div className="flex-1 w-full">
                      <div className="flex justify-between items-start mb-4 border-b border-white/10 pb-4">
                        <div>
                          <h3 className="text-xl font-bold text-white mb-1">{result.item_name}</h3>
                          {result.category && <span className="text-alviora-primary text-sm font-bold uppercase tracking-wider">{result.category}</span>}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {result.participants.sort((a:any,b:any) => a.position - b.position).map((p: any, pIdx: number) => (
                          <div key={pIdx} className="flex items-center gap-4 bg-black/20 p-3 rounded-lg border border-white/5">
                            <div className={\w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold \\}>
                              {p.position}
                            </div>
                            <div className="flex-1">
                              <div className="font-bold text-white">{p.name || p.chest_no}</div>
                              <div className="text-xs text-white/60">{p.organisation_name} {p.grade ? \ • Grade: \\ : ''}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {poster && poster.resolved_url && (
                      <div className="w-full md:w-1/3 flex flex-col items-center justify-center">
                        <img src={poster.resolved_url} alt="Result Poster" className="w-full max-w-[280px] rounded-xl shadow-2xl border border-white/20 hover:scale-[1.02] transition-transform cursor-pointer" onClick={() => window.open(poster.resolved_url, '_blank')} />
                        <span className="text-xs text-white/40 mt-3 font-['Handjet'] tracking-widest uppercase">Official Result Poster</span>
                      </div>
                    )}
                  </div>
                )}) : (
                  <div className="p-12 text-center text-alviora-body bg-white/5 rounded-xl border border-white/10">
                    No results published yet.
                  </div>
                )}
              </div>
            </div>
          </section>
          )}

          {/* Festival Gallery (Bento Grid) */}\"\"\"

if old_section:
    code = code.replace(old_section.group(0), new_section)
else:
    print("WARNING: Could not find old section")

with open('src/components/publicLanding/SahithyolsavLandingPage.web.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
    
print("Updated successfully")
