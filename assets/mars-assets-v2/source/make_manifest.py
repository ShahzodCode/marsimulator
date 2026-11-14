"""Write manifest.json from the build stats, then (with --zip) pack ../mars-assets-v2.zip.

    blender --background --python source/make_manifest.py -- --zip      (plain python works too)
"""
import os, sys, json, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
BUILD = os.path.join(os.path.dirname(PACK), '_build')

models = json.load(open(os.path.join(BUILD, 'build_stats.json')))
audio = json.load(open(os.path.join(BUILD, 'audio_stats.json')))

ICON_FOR = {'habitat': 'existing building', 'solar_farm': 'existing building', 'life_support': 'existing building',
            'greenhouse': 'existing building', 'regolith_excavator': 'existing building',
            'iron_refinery': 'existing building', 'ice_drill': 'existing building'}
AUDIO_NOTES = {
    'ui_click': 'Short soft tick.', 'ui_open_panel': 'Quick upward whoosh.',
    'build_place': 'Low thunk + small clank.', 'build_complete': 'Happy four-note chime (C major arpeggio).',
    'warning': 'Gentle two-note "uh-oh", played twice. Not an alarm.',
    'rover_depart': 'Two beeps, electric motor winds up and fades away.',
    'rover_arrive': 'Motor approaches and winds down, two-beep confirmation.',
    'rank_up': 'Rising arpeggio into a sparkling major chord.',
    'ambient_wind_loop': 'Thin Martian wind with slow gusts; exactly periodic, loops sample-accurately. '
                         'Normalised like the SFX - play it at low volume (about 0.15-0.3).',
}

assets = []
for id_, st in models.items():
    path = os.path.join(PACK, st['file'])
    if not os.path.exists(path):
        continue
    lo, hi = st['bounds']
    e = dict(file=st['file'], id=id_, kind=st['kind'])
    if 'footprint' in st:
        e['footprint'] = st['footprint']
    if 'size' in st:
        e['size'] = st['size']
    e.update(height=st['height'], triangles=st['triangles'], bytes=os.path.getsize(path),
             spin_nodes=st['spin_nodes'], materials=st['materials'], front=st['front'],
             # glTF axes: x = east, y = up, z = south
             bounds=dict(min=[lo[0], lo[2], round(-hi[1], 3)], max=[hi[0], hi[2], round(-lo[1], 3)]),
             preview='previews/' + id_ + '.png', notes=st['notes'], license='CC0-1.0', source='original')
    if os.path.exists(os.path.join(PACK, 'icons', id_ + '.svg')):
        e['icon'] = 'icons/' + id_ + '.svg'
    assert os.path.exists(os.path.join(PACK, e['preview'])), e['preview']
    assets.append(e)

for name in sorted(os.listdir(os.path.join(PACK, 'icons'))):
    id_ = name[:-4]
    assets.append(dict(file='icons/' + name, id=id_ + '_icon', kind='icon', **{'for': id_},
                       bytes=os.path.getsize(os.path.join(PACK, 'icons', name)),
                       notes=ICON_FOR.get(id_, 'asset in this pack'), license='CC0-1.0', source='original'))

for id_, st in audio.items():
    e = {k: st[k] for k in ('file', 'id', 'kind', 'duration_s', 'loop', 'bytes', 'sample_rate', 'channels', 'lufs',
                           'peak_dbfs', 'license', 'source')}
    e['notes'] = AUDIO_NOTES[id_]
    assets.append(e)

manifest = dict(
    pack='mars-assets-v2',
    units='1 unit = 1 settlement grid cell, +Y up, origin = footprint centre at ground',
    license='CC0-1.0 (all original work)',
    spin='Nodes whose extras contain "spin" rotate at that many rad/s around their local +Y.',
    extra_materials={'solar_blue': '#1b3466 metallic 0.5 roughness 0.22 (solar cells)',
                     'band_blue': '#2f6fd0 metallic 0 roughness 0.45 (water colour band)',
                     'scorch_black': '#2b2420 metallic 0 roughness 1.0 (engine scorch marks)'},
    assets=assets)
with open(os.path.join(PACK, 'manifest.json'), 'w', newline='\n') as f:
    json.dump(manifest, f, indent=2)
print('MANIFEST', len(assets), 'assets')

if '--zip' in sys.argv:
    out = os.path.join(os.path.dirname(PACK), 'mars-assets-v2.zip')
    keep_ext = {'.json', '.md', '.html', '.glb', '.svg', '.ogg', '.png', '.py'}
    n = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root, dirs, files in os.walk(PACK):
            dirs[:] = sorted(d for d in dirs if d != '__pycache__')
            for fn in sorted(files):
                if os.path.splitext(fn)[1] not in keep_ext:
                    continue
                full = os.path.join(root, fn)
                z.write(full, os.path.relpath(full, PACK).replace(os.sep, '/'))
                n += 1
    print('ZIP', out, n, 'files', os.path.getsize(out), 'bytes')
