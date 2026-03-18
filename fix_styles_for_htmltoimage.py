import re

files_scss = [
    '/home/dev/credencializacion/CredencializacionFront/src/app/content/provisional/provisional.component.scss',
    '/home/dev/credencializacion/CredencializacionFront/src/app/content/enrolamiento/plantilla-enrolamiento/plantilla-enrolamiento.component.scss'
]

for f in files_scss:
    with open(f, 'r') as file:
        content = file.read()
    content = content.replace('font-weight: normal !important;', 'font-weight: 900 !important;')
    content = content.replace("'NotoSans-Black'", "'NotoSans-Black'") # Kept as black
    with open(f, 'w') as file:
        file.write(content)

f_style = '/home/dev/credencializacion/CredencializacionFront/src/assets/styles.scss'
with open(f_style, 'r') as file:
    content = file.read()
# Revert the font weights
content = content.replace("font-family: 'NotoSans-Black';\n  src: url('/fonts/NotoSans-Black.ttf') format('truetype');\n  font-weight: normal;", "font-family: 'NotoSans-Black';\n  src: url('/fonts/NotoSans-Black.ttf') format('truetype');\n  font-weight: 900;")
content = content.replace("font-family: 'NotoSans-Bold';\n  src: url('/fonts/NotoSans-Bold.ttf') format('truetype');\n  font-weight: normal;", "font-family: 'NotoSans-Bold';\n  src: url('/fonts/NotoSans-Bold.ttf') format('truetype');\n  font-weight: 700;")
with open(f_style, 'w') as file:
    file.write(content)

files_html = [
    '/home/dev/credencializacion/CredencializacionFront/src/app/content/provisional/provisional.component.html',
    '/home/dev/credencializacion/CredencializacionFront/src/app/content/enrolamiento/plantilla-enrolamiento/plantilla-enrolamiento.component.html'
]
for f in files_html:
    with open(f, 'r') as file:
        content = file.read()
    content = content.replace('font-weight: normal', 'font-weight: 900 !important')
    with open(f, 'w') as file:
        file.write(content)
print("Done styling fix.")
