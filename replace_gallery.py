import re

file_path = r'src\components\publicLanding\SahithyolsavLandingPage.web.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_gallery = """          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 auto-rows-[250px]">
            {/* Item 1 - 2x2 Large */}
            <div className="hover:-translate-y-1 transition-transform duration-300 md:col-span-2 md:row-span-2 rounded-xl overflow-hidden relative group border border-alviora-border shadow-md border-outline-variant/50">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Exhibition" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC2hur9R9QCUF4RNNsDw8aIzfgK4nePkRKy3qxS69_zd6bCOnAL_VknVF6gKs_KEDrYfAjXaZPPO9dJCJR7Jf_MPCZj1WslcxEdpVz1kr5Ac3hCBvPrGqZDdGHzIrk3rVmqM-Rst6KMz9tDGceA7V2uQR2pz0XYCNm_wHiB6J7FCPgUVgkewF3dtKWZA7E82vb8serSapoyY0POVvlx6vImJOZBaGrootSvELASRr58K4bpphM8a6Q"/>
              <div className="absolute bottom-6 left-6 z-20">
                <span className="bg-alviora-primary px-3 py-1 rounded text-xs font-label-sm text-label-sm uppercase tracking-wider text-white mb-2 inline-block shadow-sm">Exhibition</span>
                <h3 className="font-title-md text-title-md text-white text-2xl font-bold shadow-sm">Digital Revelation</h3>
              </div>
            </div>
            {/* Item 2 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-md border-outline-variant/50">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Calligraphy" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9KhsHmCPhzPZXq5wU4DKsYPV_558HpIqcjKqnFzIQpHrVP0OSPPL57tBkjo1iQ9AWQIcc0Qoytr0vj8OSTooDqZlJO2dke4xY1bZLKgUtmb-UU6cQCU_eH9kvCsa1mPEWNsHeZbGIFSPLrfqBOQqKCI8ag2OEoJEa1x6I4gQ7eWviRUl5BUPHGtMjB_ZUM3BIYkqNoHMXU0SFOWo8L7oMfKTqIE0Dr_0YqUsHnm2Nhn_pj9c7Ng"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Calligraphy</h3>
              </div>
            </div>
            {/* Item 3 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Poetry" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBlWdOx1GT_6qOiL3HZl5bMMZ5aHYVxUKF1eGXRLuiqbEoaDmWM7iIQYMs0PPePIwGfHJP0_kSdXD6c6MeuF405pzxPvgLy0iztBBrKhubgUyCAwFfzna8gx3ED5LWoQeaKCZWnCwSbRvGNjrL6lc0YDiZRUouj4Vh_wdAWsB1N5-Ggxwnwhfnwyhlr-0DsO_jKKw4yEGRifFh71JEefw1L26cHrwHojOzN1vFfZLz1-tut3vcNTF4"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Poetry</h3>
              </div>
            </div>
            {/* Item 4 - 2x1 Wide */}
            <div className="hover:-translate-y-1 transition-transform duration-300 md:col-span-2 md:row-span-1 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Digital Art" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9KhsHmCPhzPZXq5wU4DKsYPV_558HpIqcjKqnFzIQpHrVP0OSPPL57tBkjo1iQ9AWQIcc0Qoytr0vj8OSTooDqZlJO2dke4xY1bZLKgUtmb-UU6cQCU_eH9kvCsa1mPEWNsHeZbGIFSPLrfqBOQqKCI8ag2OEoJEa1x6I4gQ7eWviRUl5BUPHGtMjB_ZUM3BIYkqNoHMXU0SFOWo8L7oMfKTqIE0Dr_0YqUsHnm2Nhn_pj9c7Ng"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Digital Art</h3>
              </div>
            </div>
            {/* Item 5 - 2x1 Wide */}
            <div className="hover:-translate-y-1 transition-transform duration-300 md:col-span-2 md:row-span-1 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Music" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBlWdOx1GT_6qOiL3HZl5bMMZ5aHYVxUKF1eGXRLuiqbEoaDmWM7iIQYMs0PPePIwGfHJP0_kSdXD6c6MeuF405pzxPvgLy0iztBBrKhubgUyCAwFfzna8gx3ED5LWoQeaKCZWnCwSbRvGNjrL6lc0YDiZRUouj4Vh_wdAWsB1N5-Ggxwnwhfnwyhlr-0DsO_jKKw4yEGRifFh71JEefw1L26cHrwHojOzN1vFfZLz1-tut3vcNTF4"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Musical Ensemble</h3>
              </div>
            </div>
            {/* Item 6 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Theatre" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC2hur9R9QCUF4RNNsDw8aIzfgK4nePkRKy3qxS69_zd6bCOnAL_VknVF6gKs_KEDrYfAjXaZPPO9dJCJR7Jf_MPCZj1WslcxEdpVz1kr5Ac3hCBvPrGqZDdGHzIrk3rVmqM-Rst6KMz9tDGceA7V2uQR2pz0XYCNm_wHiB6J7FCPgUVgkewF3dtKWZA7E82vb8serSapoyY0POVvlx6vImJOZBaGrootSvELASRr58K4bpphM8a6Q"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Live Theatre</h3>
              </div>
            </div>
            {/* Item 7 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Storytelling" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9KhsHmCPhzPZXq5wU4DKsYPV_558HpIqcjKqnFzIQpHrVP0OSPPL57tBkjo1iQ9AWQIcc0Qoytr0vj8OSTooDqZlJO2dke4xY1bZLKgUtmb-UU6cQCU_eH9kvCsa1mPEWNsHeZbGIFSPLrfqBOQqKCI8ag2OEoJEa1x6I4gQ7eWviRUl5BUPHGtMjB_ZUM3BIYkqNoHMXU0SFOWo8L7oMfKTqIE0Dr_0YqUsHnm2Nhn_pj9c7Ng"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Storytelling</h3>
              </div>
            </div>
          </div>"""

pattern = r'<div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-\[250px\]">.*?</div>\n          </section>'
replacement = new_gallery + '\n          </section>'

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)
