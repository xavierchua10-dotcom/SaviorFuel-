#!/usr/bin/env python3
"""Release bump for SaviorFuel: python3 tools/bump.py N
Sets ?v=N on every js/app file in index.html and sw.js, bumps the shell cache name,
and checks that every js/app/*.js file is listed in both."""
import re, sys, glob, os
if len(sys.argv) != 2 or not sys.argv[1].isdigit():
    sys.exit('usage: python3 tools/bump.py N')
n = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = sorted(os.path.basename(p) for p in glob.glob(os.path.join(root, 'js', 'app', '*.js')))
idx = open(os.path.join(root, 'index.html')).read()
sw = open(os.path.join(root, 'sw.js')).read()
for f in files:
    if 'js/app/%s?v=' % f not in idx: sys.exit('missing from index.html: ' + f)
    if "./js/app/%s?v=" % f not in sw: sys.exit('missing from sw.js: ' + f)
idx = re.sub(r'(js/app/[^"?]+\.js)\?v=\d+', r'\1?v=' + n, idx)
sw = re.sub(r"(\./js/app/[^'?]+\.js)\?v=\d+", r'\1?v=' + n, sw)
sw = re.sub(r"saviorfuel-shell-v\d+", 'saviorfuel-shell-v' + n, sw)
open(os.path.join(root, 'index.html'), 'w').write(idx)
open(os.path.join(root, 'sw.js'), 'w').write(sw)
print('bumped to', n, '(%d files)' % len(files))
