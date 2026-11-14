"""Render previews/<name>.png (512x512, 45 degree top-down, transparent) from the EXPORTED .glb files.

    blender --background --python source/render_previews.py [-- id id ...]
"""
import bpy, sys, os, math, glob
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(HERE)
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
files = sorted(glob.glob(os.path.join(PACK, 'models', '**', '*.glb'), recursive=True))
os.makedirs(os.path.join(PACK, 'previews'), exist_ok=True)

for path in files:
    name = os.path.splitext(os.path.basename(path))[0]
    if args and name not in args:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for ob in sc.objects:
        if ob.type != 'MESH':
            continue
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            for i in range(3):
                lo[i], hi[i] = min(lo[i], w[i]), max(hi[i], w[i])
    if hi.x - lo.x > 2:
        lo.z = max(lo.z, -0.1)                   # ignore a building's buried foundation when framing
    ctr = (lo + hi) / 2
    rad = (hi - lo).length / 2
    cam_d = bpy.data.cameras.new('cam')
    cam_d.lens = 110
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    az, el = math.radians(-62), math.radians(45)  # looking from the south-east, 45 degrees down
    d = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    fov = 2 * math.atan(18 / cam_d.lens)
    cam.location = ctr + d * (rad / math.sin(fov / 2) * 1.02)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam_d.clip_end = 1000
    sc.camera = cam
    sun_d = bpy.data.lights.new('sun', 'SUN')
    sun_d.energy = 3.2
    sun_d.angle = math.radians(4)
    sun = bpy.data.objects.new('sun', sun_d)
    sun.rotation_euler = (math.radians(48), math.radians(8), math.radians(35))
    sc.collection.objects.link(sun)
    world = bpy.data.worlds.new('w')
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (0.95, 0.86, 0.8, 1)
    bg.inputs[1].default_value = 0.75
    sc.world = world
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.render.filepath = os.path.join(PACK, 'previews', name + '.png')
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', name)
