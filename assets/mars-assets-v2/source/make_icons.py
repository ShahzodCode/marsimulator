"""Write icons/*.svg - 24x24, single colour (currentColor), no ids/fonts/scripts, < 1 KB each.
Plain Python, no Blender needed:   python source/make_icons.py   (or blender --background --python ...)"""
import os

PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
F = ' fill="currentColor" stroke="none"'
O = ' fill="currentColor" fill-opacity=".3"'

ICONS = {
    # vaulted warehouse + big door
    'storage_depot': f'<path d="M3 20V11a9 6 0 0 1 18 0v9z"{O}/><path d="M8 20v-6h8v6M8 17h8M2 20h20"/>',
    # dome habitat with door and window
    'habitat': f'<path d="M3 19a9 9 0 0 1 18 0z"{O}/><path d="M10 19v-4a2 2 0 0 1 4 0v4M2 19h20M12 4v3"/><circle cx="12" cy="3" r="1"{F}/>',
    # tilted panel on a post + sun
    'solar_farm': f'<path d="M3 17l3-8h12l3 8z"{O}/><path d="M12 9v8M4.5 13h15M12 17v4M8 21h8"/><circle cx="19" cy="4" r="2"{F}/>',
    # heart with a pulse line
    'life_support': f'<path d="M12 20s-8-4.6-8-10.2A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 8 2.3C20 15.4 12 20 12 20z"{O}/><path d="M6 12h3l1.5-3 2.5 6 1.5-3h3.500"/>',
    # glasshouse with a sprout
    'greenhouse': f'<path d="M3 20v-8l9-7 9 7v8z"{O}/><path d="M12 20v-6M12 16c-3 0-4-1.500-4-4 3 0 4 1.500 4 4zM12 14c0-2 1-3.500 4-3.500 0 2.500-1.500 3.500-4 3.500"/>',
    # bucket-wheel digging a heap
    'regolith_excavator': f'<circle cx="8" cy="10" r="4"{O}/><path d="M8 4v2M8 14v2M2 10h2M12 10h2M11 12l8 6M2 20h20"/><path d="M14 20l3-4 3 4z"{F}/>',
    # furnace with flame-free glow + ingot
    'iron_refinery': f'<path d="M5 20V9l3-5h8l3 5v11z"{O}/><path d="M9 20v-5h6v5M9 9h6M2 20h20"/><path d="M10.500 12h3"/>',
    # drill bit into ice + droplet
    'ice_drill': f'<path d="M8 3h8v5H8z"{O}/><path d="M12 8v6M9.500 10.500l5 2M9.500 13l5 2M12 15v3M2 18h20"/><path d="M12 19.500l1.700 2.200a1.900 1.900 0 1 1-3.400 0z"{F}/>',
    # battery with bolt
    'battery_bank': f'<path d="M4 7h16v13H4z"{O}/><path d="M8 7V4M16 7V4"/><path d="M13 9l-4 5h3l-1 4 4-5h-3z"{F}/>',
    # box with fan intake and O2 bubbles
    'moxie_unit': f'<path d="M3 9h12v11H3z"{O}/><circle cx="9" cy="14.500" r="3"/><path d="M9 11.500v6M6 14.500h6"/><circle cx="19" cy="6" r="2.500"/><circle cx="19.500" cy="13" r="1.500"{F}/>',
    # silo + round tank
    'storage_silo': f'<path d="M4 20V8l4-4 4 4v12z"{O}/><path d="M4 12h8M4 16h8M2 20h20"/><circle cx="17.500" cy="15.500" r="3.500"/>',
    # six-wheel rover with mast
    'survey_rover': f'<path d="M4 9h13v5H4z"{O}/><path d="M14 9V4h4v2.500h-4M7 9V6"/><circle cx="5.500" cy="18" r="2"{F}/><circle cx="12" cy="18" r="2"{F}/><circle cx="18.500" cy="18" r="2"{F}/><path d="M5.500 14v2M12 14v2M17 14l1.500 2"/>',
    # truck with crate
    'cargo_rover': f'<path d="M2 14h12v3H2zM4 8h6v6H4z"{O}/><path d="M14 17V9h4l3 4v4h-7M4 11h6"/><circle cx="6" cy="18.500" r="2"{F}/><circle cx="17" cy="18.500" r="2"{F}/>',
}

if __name__ == '__main__':
    out = os.path.join(PACK, 'icons')
    os.makedirs(out, exist_ok=True)
    for name, body in ICONS.items():
        svg = S + body.replace('.500', '.5').replace('.700', '.7').replace('.200', '.2').replace('.900', '.9').replace('.400', '.4') + '</svg>\n'
        assert len(svg.encode()) < 1024, name
        with open(os.path.join(out, name + '.svg'), 'w', newline='\n') as f:
            f.write(svg)
        print('ICON', name, len(svg))
