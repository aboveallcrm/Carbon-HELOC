import re

with open('AboveAllCarbon_HELOC_v12_FIXED.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all script tags with type text/javascript or no type (exclude application/ld+json)
scripts = re.findall(r'<script(?:\s+type=["\']([^"\']+)["\'])?[^>]*>(.*?)</script>', content, re.DOTALL | re.IGNORECASE)

# Filter to only JavaScript scripts (type is None, empty, or contains javascript)
js_scripts = []
for script_type, script_content in scripts:
    if script_type is None or script_type == '' or 'javascript' in script_type.lower():
        js_scripts.append(script_content)

# Combine all JavaScript
all_js = '\n\n'.join(js_scripts)

# Write to temp file for checking
with open('temp_js_check.js', 'w', encoding='utf-8') as f:
    f.write(all_js)

print('Extracted JavaScript to temp_js_check.js')
print(f'Total lines: {len(all_js.splitlines())}')
