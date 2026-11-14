"""Rebuild every .glb in the pack.

    blender --background --python source/build_all.py            (all models)
    blender --background --python source/build_all.py -- battery_bank crate   (just these ids)

Writes models/**.glb and a stats file (../_build/build_stats.json) that make_manifest.py reads.
"""
import bpy, sys, os, json, importlib

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True

REG = {}
for modname in ('models_buildings', 'models_tier_b', 'models_props'):
    try:
        REG.update(importlib.import_module(modname).MODELS)
    except ModuleNotFoundError as e:
        print('skip', modname, e)

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ids = args or list(REG)
BUILD = os.path.join(os.path.dirname(PACK), '_build')      # scratch folder next to the pack (not shipped)
os.makedirs(BUILD, exist_ok=True)
stats_path = os.path.join(BUILD, 'build_stats.json')
stats = json.load(open(stats_path)) if os.path.exists(stats_path) else {}

LIMITS = {'building': (40000, 1_500_000), 'vehicle': (12000, 500_000), 'prop': (2000, 500_000),
          'character': (3000, 500_000)}
for id_ in ids:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    m = REG[id_]()
    sub = os.path.join(PACK, 'models', m.subdir) if m.subdir else os.path.join(PACK, 'models')
    st = m.export(os.path.join(sub, id_ + '.glb'))
    stats[id_] = st
    tl, bl = LIMITS[st['kind']]
    if id_ in ('landing_pad', 'supply_lander', 'comms_tower', 'construction_scaffold'):
        tl, bl = LIMITS['building']
    flag = '' if (st['triangles'] <= tl and st['bytes'] <= bl) else '  <-- OVER BUDGET'
    print(f"BUILT {id_:24s} tris={st['triangles']:6d} bytes={st['bytes']:8d} nodes={st['nodes']:2d} "
          f"h={st['height']:.2f} bounds={st['bounds']}{flag}")

json.dump(stats, open(stats_path, 'w'), indent=1)
