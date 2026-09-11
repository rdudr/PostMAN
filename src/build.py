import base64, re, sys, os

BASE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(os.path.dirname(BASE), 'app.html')

def rd(name):
    return open(os.path.join(BASE, name), encoding='utf-8').read()

parts_js = ['p3_core.js','p4_registry.js','p5_ui.js','p6_forms.js','p7_modules.js',
            'p8_sld.js','p9_charts.js','p10_report.js','p11_sections.js',
            'p14_custom.js','p15_bills.js','p12_pages.js','p13_boot.js']

head  = rd('p1_head.html')
shell = rd('p2_shell.html')
js    = '\n\n'.join(rd(p) for p in parts_js)

# SheetJS is the one library that earns its place here - reading .xlsx by hand
# is not a reasonable thing to write. It comes from cdnjs, pinned, before the
# inline script that uses its global.
#
# ONE output, deliberately. There used to be a second "local" build served by
# a launcher, because serving the app over http is what lets the OCR reader
# load its worker and language model. It was the technically better artefact
# and the worse product: a folder of five things is something a team gets
# wrong when they share it, and a tool nobody can pass to a colleague is not
# finished. So: one file, double-clickable, e-mailable. OCR loads from the CDN
# when the network allows it and says so plainly when it does not.
sheetjs = '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>\n'

doc = head + '\n' + shell + '\n' + sheetjs + '<script>\n' + js + '\n</script>\n'
# ---- encoding hardening -------------------------------------------------
# The page must render identically whether or not a charset is declared, so
# nothing non-ASCII survives literally: HTML text becomes numeric entities,
# JavaScript becomes \uXXXX escapes.
def esc_js(block):
    return ''.join(ch if ord(ch) < 128 else '\\u%04X' % ord(ch) for ch in block)

def esc_html(block):
    return ''.join(ch if ord(ch) < 128 else '&#%d;' % ord(ch) for ch in block)

pieces, pos = [], 0
for m in re.finditer(r'<script[^>]*>(.*?)</script>', doc, re.S):
    pieces.append(('html', doc[pos:m.start()]))
    pieces.append(('raw',  doc[m.start():m.start(1)]))
    pieces.append(('js',   m.group(1)))
    pieces.append(('raw',  '</script>'))
    pos = m.end()
pieces.append(('html', doc[pos:]))

out = []
for kind, block in pieces:
    if kind == 'js':
        out.append(esc_js(block))
    elif kind == 'html':
        # <style> content is CSS, where entities do not work - assert it is ASCII
        for sm in re.finditer(r'<style[^>]*>(.*?)</style>', block, re.S):
            bad = [c for c in sm.group(1) if ord(c) > 127]
            if bad:
                sys.exit('Non-ASCII in CSS, which entities cannot fix: %r' % set(bad))
        out.append(esc_html(block))
    else:
        out.append(block)
doc = ''.join(out)

def b64(path):
    return 'data:image/png;base64,' + base64.b64encode(open(path,'rb').read()).decode()

ART = os.path.join(os.path.dirname(BASE), 'art')
for token, path in [('__SEAL__',  '/tmp/verify/iitgn-seal.png'),
                    ('__KISEM__', '/tmp/verify/kisem-logo.png'),
                    ('__PLATE1__', os.path.join(ART, 'plate1.png')),
                    ('__PLATE2__', os.path.join(ART, 'plate2.png'))]:
    doc = doc.replace(token, b64(path))
    assert token not in doc, token
assert all(ord(c) < 128 for c in doc), 'non-ASCII survived'

open(OUT, 'w', encoding='utf-8').write(doc)
print('wrote %s  %.0f KB' % (OUT, len(doc.encode())/1024))
