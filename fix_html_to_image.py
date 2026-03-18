import re

files = [
    '/home/dev/credencializacion/CredencializacionFront/src/app/content/busqueda-avanzada/busqueda-avanzada.component.ts',
    '/home/dev/credencializacion/CredencializacionFront/src/app/content/credencializacion/credencializacion.component.ts'
]

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Replace import
    content = content.replace("import html2canvas from 'html2canvas';", "import * as htmlToImage from 'html-to-image';")

    # 2. Replace options block
    # Note: html-to-image uses `pixelRatio` instead of `scale`
    old_options = re.search(r'const options: any = \{.*?\n            \};', content, re.DOTALL)
    if old_options:
        new_options = """const options = {
              pixelRatio: 2,
              backgroundColor: '#ffffff'
            };"""
        content = content.replace(old_options.group(), new_options)

    # 3. Replace front rendering
    content = re.sub(
        r'const canvasFront = await html2canvas\(element, options\);\s*const imgDataFront = canvasFront\.toDataURL\(\'image/png\', 1\.0\);',
        "const imgDataFront = await htmlToImage.toPng(element, options);",
        content
    )

    # 4. Replace back rendering
    content = re.sub(
        r'const canvasBack = await html2canvas\(elementReverso, options\);\s*const imgDataBack = canvasBack\.toDataURL\(\'image/png\', 1\.0\);',
        "const imgDataBack = await htmlToImage.toPng(elementReverso, options);",
        content
    )

    with open(filepath, 'w') as f:
        f.write(content)

print("Done")
