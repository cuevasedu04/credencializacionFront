import codecs, re

file_path = 'src/app/content/busqueda-avanzada/busqueda-avanzada.component.html'
text = codecs.open(file_path, 'r', 'utf-8').read()

# I will extract the buttons directly and rebuild the header correctly
buttons_match = re.search(r'<div class="d-flex gap-2[^>]*>.*?<!--Descargar excel-->.*?<i class="fa-regular fa-file-excel me-1"></i> Excel\s*</button>\s*</div>', text, flags=re.DOTALL)
if not buttons_match:
    print("Could not find the buttons section!")
    exit(1)

buttons_html = buttons_match.group(0).replace('<div class="d-flex gap-2">', '<div class="d-flex gap-2 mb-2">')

# Strip the broken header out and the d-none wrapper
start_idx = text.find('<div class="card-header')
end_idx = text.find('<div class="card-body p-0')

correct_header = f'''<div class="card-header bg-white pt-3 pb-0 d-flex justify-content-between align-items-end border-bottom">
            <!-- Pestañas (Tabs) -->
            <ul class="nav nav-tabs border-bottom-0">
                <li class="nav-item">
                    <a class="nav-link text-secondary" 
                       style="cursor: pointer;"
                       [ngStyle]="activeTab === 'busqueda' ? {{'background-color': '#f8f9fa', 'border-color': '#dee2e6 #dee2e6 #fff', 'color': '#5a5c69', 'font-weight': 'bold'}} : {{}}"
                       (click)="selectTab('busqueda')">
                        <i class="fas fa-search me-2"></i>Búsqueda Avanzada
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link text-secondary" 
                       style="cursor: pointer;"
                       [ngStyle]="activeTab === 'impresion' ? {{'background-color': '#f8f9fa', 'border-color': '#dee2e6 #dee2e6 #fff', 'color': '#5a5c69', 'font-weight': 'bold'}} : {{}}"
                       (click)="selectTab('impresion')">
                        <i class="fas fa-print me-2"></i>Pendientes de Impresión
                    </a>
                </li>
            </ul>
{buttons_html}
        </div>
        
        '''

text = text[:start_idx] + correct_header + text[end_idx:]

codecs.open(file_path, 'w', 'utf-8').write(text)
print("Updated header successfully")
